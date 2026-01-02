/**
 * Streamable HTTP Transport E2E Tests
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 20.10
 *
 * End-to-end tests for MCP Streamable HTTP protocol compliance.
 */

import { createHTTPServerWithConfig, HTTPServerWithConfig } from '../../src/cli/http-server-with-config.js';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Streamable HTTP Transport E2E', () => {
  let server: HTTPServerWithConfig;
  let configPath: string;
  let port: number;

  beforeAll(async () => {
    // Create temporary config file without auth
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-sse-test-'));
    configPath = path.join(tempDir, 'remote-config.json');

    await fs.writeFile(
      configPath,
      JSON.stringify({
        remote: {
          enabled: true,
          port: 0, // Will use random port from CLI
          host: '127.0.0.1',
          auth: {
            type: 'none',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      })
    );

    // Find available port
    port = 30000 + Math.floor(Math.random() * 10000);

    // Start server
    server = await createHTTPServerWithConfig({
      configPath,
      port,
      host: '127.0.0.1',
    });
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }

    // Cleanup
    try {
      const tempDir = path.dirname(configPath);
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('GET /mcp SSE Stream (Requirement 20.1)', () => {
    it('should establish SSE connection on GET /mcp', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should return text/event-stream content type (Requirement 20.2)', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['content-type']).toBe('text/event-stream');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should set Cache-Control to no-cache (Requirement 20.5)', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['cache-control']).toBe('no-cache');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should set Connection to keep-alive (Requirement 20.6)', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['connection']).toBe('keep-alive');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });
  });

  describe('CORS Headers (Requirement 20.4, 20.9)', () => {
    it('should include Access-Control-Allow-Origin header', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['access-control-allow-origin']).toBe('*');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should include Access-Control-Allow-Methods header', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should include Access-Control-Allow-Headers header', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should handle OPTIONS preflight request (Requirement 20.9)', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'OPTIONS',
        },
        (res) => {
          expect(res.statusCode).toBe(204);
          expect(res.headers['access-control-allow-origin']).toBe('*');
          expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });
  });

  describe('SSE Event Format', () => {
    it('should send endpoint event with session ID', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk.toString();

            // Check for endpoint event
            if (data.includes('event: endpoint')) {
              expect(data).toContain('sessionId');
              expect(data).toContain('url');
              req.destroy();
              done();
            }
          });
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should send keepalive comments (Requirement 20.3)', (done) => {
      jest.setTimeout(35000); // 35 second timeout for keepalive test

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
        },
        (res) => {
          let data = '';
          let keepaliveReceived = false;

          res.on('data', (chunk) => {
            data += chunk.toString();

            // Check for keepalive comment
            if (data.includes(': keepalive') && !keepaliveReceived) {
              keepaliveReceived = true;
              expect(data).toContain(': keepalive');
              req.destroy();
              done();
            }
          });
        }
      );

      req.on('error', (err) => {
        if (!err.message.includes('ECONNRESET')) {
          done(err);
        }
      });
      req.end();
    }, 35000);
  });

  describe('Existing POST /mcp Compatibility (Requirement 20.8)', () => {
    it('should continue to accept POST /mcp requests', (done) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);

          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });

          res.on('end', () => {
            const response = JSON.parse(body);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
            expect(response.result).toBeDefined();
            expect(response.result.tools).toBeDefined();
            done();
          });
        }
      );

      req.on('error', done);
      req.write(postData);
      req.end();
    });
  });

  describe('Authentication Disabled Mode (Requirement 20.10)', () => {
    it('should allow GET /mcp without authentication when authEnabled is false', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'GET',
          // No Authorization header
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });
  });

  describe('Query Parameters Handling', () => {
    it('should accept GET /mcp with query parameters', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp?session=test-session&foo=bar',
          method: 'GET',
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toBe('text/event-stream');
          req.destroy();
          done();
        }
      );

      req.on('error', done);
      req.end();
    });

    it('should accept POST /mcp with query parameters', (done) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/mcp?transport=sse&session=test',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          expect(res.statusCode).toBe(200);

          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });

          res.on('end', () => {
            const response = JSON.parse(body);
            expect(response.jsonrpc).toBe('2.0');
            expect(response.id).toBe(1);
            done();
          });
        }
      );

      req.on('error', done);
      req.write(postData);
      req.end();
    });

    it('should accept /health with query parameters', (done) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health?timestamp=123456',
          method: 'GET',
        },
        (res) => {
          expect(res.statusCode).toBe(200);

          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });

          res.on('end', () => {
            const response = JSON.parse(body);
            expect(response.status).toBe('ok');
            done();
          });
        }
      );

      req.on('error', done);
      req.end();
    });
  });
});

describe('Streamable HTTP Transport with Authentication', () => {
  let server: HTTPServerWithConfig;
  let configPath: string;
  let port: number;
  const testSecret = 'test-secret-for-sse-authentication-min-32-chars';

  beforeAll(async () => {
    // Create temporary config file with JWT auth
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sage-sse-auth-test-'));
    configPath = path.join(tempDir, 'remote-config.json');

    await fs.writeFile(
      configPath,
      JSON.stringify({
        remote: {
          enabled: true,
          port: 0,
          host: '127.0.0.1',
          auth: {
            type: 'jwt',
            secret: testSecret,
            expiresIn: '1h',
          },
          cors: {
            allowedOrigins: ['*'],
          },
        },
      })
    );

    // Find available port
    port = 31000 + Math.floor(Math.random() * 10000);

    // Start server
    server = await createHTTPServerWithConfig({
      configPath,
      port,
      host: '127.0.0.1',
    });
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }

    // Cleanup
    try {
      const tempDir = path.dirname(configPath);
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should require authentication for GET /mcp when auth is enabled', (done) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'GET',
        // No Authorization header
      },
      (res) => {
        expect(res.statusCode).toBe(401);
        done();
      }
    );

    req.on('error', done);
    req.end();
  });

  it('should accept GET /mcp with valid JWT token', (done) => {
    // First get a token
    const postData = JSON.stringify({ secret: testSecret });

    const tokenReq = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/auth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (tokenRes) => {
        let body = '';
        tokenRes.on('data', (chunk) => {
          body += chunk.toString();
        });

        tokenRes.on('end', () => {
          const { token } = JSON.parse(body);

          // Now try GET /mcp with the token
          const sseReq = http.request(
            {
              hostname: '127.0.0.1',
              port,
              path: '/mcp',
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
            (res) => {
              expect(res.statusCode).toBe(200);
              expect(res.headers['content-type']).toBe('text/event-stream');
              sseReq.destroy();
              done();
            }
          );

          sseReq.on('error', done);
          sseReq.end();
        });
      }
    );

    tokenReq.on('error', done);
    tokenReq.write(postData);
    tokenReq.end();
  });

  it('should reject GET /mcp with invalid token', (done) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      },
      (res) => {
        expect(res.statusCode).toBe(401);
        done();
      }
    );

    req.on('error', done);
    req.end();
  });
});
