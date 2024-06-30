const http = require("http");
const fs = require("fs").promises;
const path = require("path");
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
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Unsupported content-type");
            return;
          }

          if (this.options.defaultHeaders) {
            for (const [key, value] of Object.entries(
              this.options.defaultHeaders
            )) {
              res.setHeader(key, value);
            }
          }

          if (this.options.enableLogging) {
            console.log(`${req.method} ${req.url}`);
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

class NodeRoute {
  #server;
  #routes;
  #globalMiddlewares;
  constructor(options = {}) {
    this.#server = http.createServer();
    this.#routes = [];
    this.#globalMiddlewares = [];
    this.options = options;

    this.#server.on("request", async (req, res) => {
      res.sendFile = async (filePath) => {
        try {
          const fileHandle = await fs.open(filePath, "r");
          const fileReadStream = fileHandle.createReadStream();

          const ext = path.extname(filePath);
          const mimeType = mimeTypes[ext] || "application/octet-stream";

          res.setHeader("Content-Type", mimeType);
          fileReadStream.pipe(res);
        } catch (error) {
          console.error(error);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Internal Server Error");
        }
      };

      res.status = (code) => {
        res.statusCode = code;
        return res;
      };

      res.json = (data) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };

      res.send = (data) => {
        res.setHeader("Content-Type", "text/plain");
        res.end(data);
      };

      const handleRouteRequest = async () => {
        let staticRoute = this.#routes.find(
          (route) => route.staticRoutes.has(req.url) && req.method === "GET"
        );

        if (staticRoute) {
          const filePath = staticRoute.staticRoutes.get(req.url);
          await serveStaticFile(filePath, res);
        } else {
          staticRoute = this.#routes.find((route) => {
            const htmlFile = route.options.index
              ? route.options.index
              : "index.html";

            return (
              route.path === req.url &&
              req.method === "GET" &&
              route.staticRoutes.has(
                (req.url === "/" ? "/" : req.url + "/") + htmlFile
              )
            );
          });
          if (staticRoute) {
            const htmlFile = staticRoute.options.index
              ? staticRoute.options.index
              : "index.html";
            const filePath = staticRoute.staticRoutes.get(
              (req.url === "/" ? "/" : req.url + "/") + htmlFile
            );

            await serveStaticFile(filePath, res);
          } else {
            const route = this.#routes.find((route) => {
              const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
              return route.extractParams(route.path, parsedUrl.pathname);
            });

            if (route) {
              await route.handleRequest(req, res);
            } else {
              serve404(res, this.options.custom404Path);
            }
          }
        }
      };

      const executeGlobalMiddlewares = (index) => {
        if (index >= this.#globalMiddlewares.length) {
          handleRouteRequest();
        } else {
          this.#globalMiddlewares[index](req, res, () =>
            executeGlobalMiddlewares(index + 1)
          );
        }
      };

      executeGlobalMiddlewares(0);
    });
  }

  use(middleware) {
    if (typeof middleware !== "function") {
      throw new Error("Middleware must be a function");
    }
    this.#globalMiddlewares.push(middleware);
  }

  route(path, options = null) {
    if (this.#routes.some((route) => route.path === path)) {
      throw new Error(`Route for path "${path}" is already defined`);
    }
    const route = new Route(path, options ? options : this.options);
    this.#routes.push(route);
    return route;
  }

  listen(port, cb) {
    this.#server.listen(port, cb);
  }
}

module.exports = NodeRoute;
