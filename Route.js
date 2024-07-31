const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const stream = require("stream");
const { serve404, mimeTypes, serveStaticFile } = require("./utils");

class Route {
  constructor(path, options = {}) {
    if (typeof path !== "string" || !path) {
      throw new Error("Provide a valid route path");
    }
    this.path = path;
    this.handlers = {
      GET: null,
      POST: null,
      PUT: null,
      DELETE: null,
    };
    this.staticRoutes = new Map();
    this.options = options;
    this.globalMiddlewares = [];
  }

  validateHandler(handler) {
    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }
  }

  registerHandler(method, ...handlers) {
    if (this.handlers[method]) {
      throw new Error(
        `${method} handler for path "${this.path}" is already defined`
      );
    }
    handlers.forEach(this.validateHandler);
    this.handlers[method] = handlers;
  }

  get(...handlers) {
    this.registerHandler("GET", ...handlers);
    return this;
  }

  post(...handlers) {
    this.registerHandler("POST", ...handlers);
    return this;
  }

  put(...handlers) {
    this.registerHandler("PUT", ...handlers);
    return this;
  }

  delete(...handlers) {
    this.registerHandler("DELETE", ...handlers);
    return this;
  }

  use(...middlewares) {
    middlewares.forEach(this.validateHandler);
    this.globalMiddlewares.push(...middlewares);
    return this;
  }

  async addStaticRoutes(rootPath, prefix = "") {
    try {
      const stat = await fs.lstat(rootPath);
      if (stat.isFile()) {
        const urlPath = path
          .join(prefix, path.relative(this.staticDir, rootPath))
          .replace(/\\/g, "/");
        this.staticRoutes.set(
          (this.path === "/" ? "/" : this.path + "/") + urlPath,
          path.join(this.staticDir, urlPath)
        );
      } else if (stat.isDirectory()) {
        const files = await fs.readdir(rootPath);
        for (const file of files) {
          await this.addStaticRoutes(path.join(rootPath, file), prefix);
        }
      }
    } catch (error) {
      console.error("Error setting up static routes:", error);
    }
  }

  extractParams(routePattern, actualUrl) {
    const paramNames = [];
    const exists = new Set();
    const routeSegments = routePattern.split("/");
    const urlSegments = actualUrl.split("/");

    if (routeSegments.length !== urlSegments.length) {
      return null;
    }

    const params = {};
    for (let i = 0; i < routeSegments.length; i++) {
      if (routeSegments[i] && exists.has(routeSegments[i])) {
        throw new Error(
          "Found duplicate parameter in URL. Parameter name should be unique"
        );
      }
      const routeSegment = routeSegments[i];
      const urlSegment = urlSegments[i];
      exists.add(routeSegment);
      if (routeSegment.startsWith(":")) {
        const paramName = routeSegment.slice(1);
        paramNames.push(paramName);
        params[paramName] = urlSegment;
      } else if (routeSegment !== urlSegment) {
        return null; // If a static segment doesn't match, return null
      }
    }
    return params;
  }

  async handleRequest(req, res) {
    const urlPath = req.url === "/" ? "/index.html" : req.url;

    if (this.staticRoutes.has(urlPath) && req.method === "GET") {
      const filePath = this.staticRoutes.get(urlPath);
      await serveStaticFile(filePath, res);
    } else {
      const method = req.method.toUpperCase();
      const handlers = this.handlers[method];

      if (handlers) {
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        req.params = this.extractParams(this.path, parsedUrl.pathname);
        req.query = Object.fromEntries(parsedUrl.searchParams.entries());

        let body = Buffer.alloc(0);
        let bodySize = 0;

        req.on("data", (data) => {
          bodySize += data.length;
          if (bodySize > this.options.bodySizeLimit) {
            res.writeHead(413, { "Content-Type": "text/plain" });
            res.end("Payload Too Large");
            req.destroy();
            return;
          }
          body = Buffer.concat([body, data]);
        });

        req.on("end", () => {
          const contentType = req.headers["content-type"];

          if (contentType === "application/json") {
            try {
              req.body = body ? JSON.parse(body.toString()) : {};
            } catch (error) {
              console.error("Error parsing JSON:", error);
              res.writeHead(400, { "Content-Type": "text/plain" });
              res.end("Bad Request");
              return;
            }
          } else if (
            contentType &&
            contentType.includes("multipart/form-data")
          ) {
            // Placeholder for multipart handling or middleware delegation
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Multipart form data not supported");
            return;
          } else if (contentType) {
            const readableStream = new stream.PassThrough();
            readableStream.end(body);
            req.file = readableStream;
          }
          if (this.options.defaultHeaders) {
            for (const [key, value] of Object.entries(
              this.options.defaultHeaders
            )) {
              res.setHeader(key, value);
            }
          }

          const allHandlers = [...this.globalMiddlewares, ...handlers];

          const executeHandlers = (index) => {
            if (index >= allHandlers.length) return;
            allHandlers[index](req, res, () => executeHandlers(index + 1));
          };

          executeHandlers(0);
        });

        req.on("error", (error) => {
          console.error(error);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        });
      } else {
        serve404(res, this.options.custom404Path);
      }
    }
  }

  sendStatic(staticDir, options = {}) {
    if (typeof staticDir !== "string" || !staticDir) {
      throw new Error("Provide a valid static directory path");
    }

    this.staticDir = staticDir;
    this.options = options;

    this.addStaticRoutes(staticDir).catch((error) => {
      console.error("Error adding static routes:", error);
    });

    return this;
  }
}

module.exports = Route;
