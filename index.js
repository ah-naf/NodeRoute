const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const url = require("url");
const { serve404, mimeTypes, serveStaticFile } = require("./utils");

/**
 * Class representing a route.
 */
class Route {
  /**
   * Create a route.
   * @param {string} path - The route path.
   */
  constructor(path) {
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
    this.options = {};
    this.globalMiddlewares = [];
  }

  /**
   * Validate that the handler is a function.
   * @param {Function} handler - The handler function.
   */
  validateHandler(handler) {
    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }
  }

  /**
   * Register a handler for a specific HTTP method along with middlewares.
   * @param {string} method - The HTTP method.
   * @param {...Function} handlers - The handler and middleware functions.
   */
  registerHandler(method, ...handlers) {
    if (this.handlers[method]) {
      throw new Error(
        `${method} handler for path "${this.path}" is already defined`
      );
    }
    handlers.forEach(this.validateHandler);
    this.handlers[method] = handlers;
  }

  /**
   * Chainable method for registering a GET handler.
   * @param {...Function} handlers - The GET handler and middleware functions.
   * @returns {Route} The current route instance.
   */
  get(...handlers) {
    this.registerHandler("GET", ...handlers);
    return this;
  }

  /**
   * Chainable method for registering a POST handler.
   * @param {...Function} handlers - The POST handler and middleware functions.
   * @returns {Route} The current route instance.
   */
  post(...handlers) {
    this.registerHandler("POST", ...handlers);
    return this;
  }

  /**
   * Chainable method for registering a PUT handler.
   * @param {...Function} handlers - The PUT handler and middleware functions.
   * @returns {Route} The current route instance.
   */
  put(...handlers) {
    this.registerHandler("PUT", ...handlers);
    return this;
  }

  /**
   * Chainable method for registering a DELETE handler.
   * @param {...Function} handlers - The DELETE handler and middleware functions.
   * @returns {Route} The current route instance.
   */
  delete(...handlers) {
    this.registerHandler("DELETE", ...handlers);
    return this;
  }

  /**
   * Chainable method for registering global middleware.
   * @param {...Function} middlewares - The middleware functions.
   * @returns {Route} The current route instance.
   */
  use(...middlewares) {
    middlewares.forEach(this.validateHandler);
    this.globalMiddlewares.push(...middlewares);
    return this;
  }

  /**
   * Add static routes from a directory recursively.
   * @param {string} rootPath - The root directory path.
   * @param {string} [prefix=""] - The URL prefix.
   */
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

  /**
   * Parse URL parameters based on the route pattern.
   * @param {string} routePattern - The route pattern.
   * @param {string} actualUrl - The actual URL.
   * @returns {Object|null} The parsed parameters or null if no match.
   */
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
      if (exists.has(routeSegments[i])) {
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

  /**
   * Handle incoming requests for this route.
   * @param {http.IncomingMessage} req - The request object.
   * @param {http.ServerResponse} res - The response object.
   */
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

        // Collect body from request
        let body = "";
        req.on("data", (data) => {
          body += data.toString();
        });

        req.on("end", () => {
          const contentType = req.headers["content-type"];

          if (contentType === "application/json") {
            try {
              req.body = body ? JSON.parse(body) : {};
            } catch (error) {
              console.error("Error parsing JSON:", error);
              res.writeHead(400, { "Content-Type": "text/plain" });
              res.end("Bad Request");
              return;
            }
          } else if (contentType.includes("multipart/form-data")) {
            const boundary = contentType.split(";")[1].split("=")[1];
            const parts = body.split(`--${boundary}`).slice(1, -1);

            req.body = {};
            req.files = [];
            let tempBody = {};

            parts.forEach((part) => {
              const [rawHeaders, rawBody] = part.split("\r\n\r\n");
              const headers = rawHeaders.split("\r\n");
              const disposition = headers.find((header) =>
                header.startsWith("Content-Disposition")
              );

              if (disposition) {
                const nameMatch = disposition.match(/name="([^"]+)"/);
                const filenameMatch = disposition.match(/filename="([^"]+)"/);

                if (nameMatch) {
                  const name = nameMatch[1];

                  if (filenameMatch) {
                    const filename = filenameMatch[1];
                    const fileContent = rawBody.split("\r\n")[0];

                    req.files.push({
                      fieldName: name,
                      filename,
                      content: fileContent,
                    });
                  } else {
                    const fieldValue = rawBody.trim();
                    tempBody = { ...tempBody, [name]: fieldValue };
                  }
                }
              }
            });

            req.body = tempBody;
          }

          // Execute global middlewares, specific middlewares and handler
          const allHandlers = [...this.globalMiddlewares, ...handlers];

          // Execute middleware and handler
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
        serve404(res);
      }
    }
  }

  /**
   * Set up static file serving for this route.
   * @param {string} staticDir - The static directory path.
   * @param {Object} [options={}] - Additional options.
   * @returns {Route} The current route instance.
   */
  sendStatic(staticDir, options = {}) {
    if (typeof staticDir !== "string" || !staticDir) {
      throw new Error("Provide a valid static directory path");
    }

    this.staticDir = staticDir;
    this.options = options;

    // Ensure promises are handled properly
    this.addStaticRoutes(staticDir).catch((error) => {
      console.error("Error adding static routes:", error);
    });

    return this;
  }
}

/**
 * Main server class.
 */
class NodeRoute {
  #server;
  #routes;
  #globalMiddlewares;
  constructor() {
    this.#server = http.createServer();
    this.#routes = [];
    this.#globalMiddlewares = [];

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

      // Handle route request
      const handleRouteRequest = async () => {
        // First, check for static routes
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
            // Fallback to dynamic routes
            const route = this.#routes.find((route) => {
              return route.extractParams(
                route.path,
                url.parse(req.url).pathname
              );
            });

            if (route) {
              await route.handleRequest(req, res);
            } else {
              // Serve the custom 404 page
              serve404(res);
            }
          }
        }
      };

      // Execute global middlewares
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

  /**
   * Register a global middleware.
   * @param {Function} middleware - The middleware function.
   */
  use(middleware) {
    if (typeof middleware !== "function") {
      throw new Error("Middleware must be a function");
    }
    this.#globalMiddlewares.push(middleware);
  }

  /**
   * Create a new route.
   * @param {string} path - The route path.
   * @returns {Route} The new route instance.
   */
  route(path) {
    if (this.#routes.some((route) => route.path === path)) {
      throw new Error(`Route for path "${path}" is already defined`);
    }
    const route = new Route(path);
    this.#routes.push(route);
    return route;
  }

  /**
   * Start the server.
   * @param {number} port - The port number.
   * @param {Function} cb - The callback function.
   */
  listen(port, cb) {
    this.#server.listen(port, cb);
  }
}

module.exports = NodeRoute;
