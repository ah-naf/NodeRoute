const fs = require("fs");
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
      const stat = await fs.promises.lstat(rootPath);
      if (stat.isFile()) {
        const urlPath = path
          .join(prefix, path.relative(this.staticDir, rootPath))
          .replace(/\\/g, "/");
        this.staticRoutes.set(
          (this.path === "/" ? "/" : this.path + "/") + urlPath,
          path.join(this.staticDir, urlPath)
        );
      } else if (stat.isDirectory()) {
        const files = await fs.promises.readdir(rootPath);
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

        const contentType = req.headers["content-type"];

        if (contentType === "application/json") {
          this.handleJsonRequest(req, res, handlers);
        } else if (contentType && contentType.includes("multipart/form-data")) {
          // this.handleMultipart(req, res, handlers);
          throw new Error(
            "Multipart/form-data is not supported at this moment"
          );
        } else {
          this.handleOtherRequests(req, res, handlers);
        }
      } else {
        serve404(res, this.options.custom404Path);
      }
    }
  }

  handleJsonRequest(req, res, handlers) {
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
      try {
        req.body = body ? JSON.parse(body.toString()) : {};
        this.executeHandlers(req, res, handlers);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad Request");
      }
    });

    req.on("error", (error) => {
      console.error(error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
  }

  // handleMultipart(req, res, handlers) {
  //   const boundary = req.headers["content-type"].split("boundary=")[1];
  //   const boundaryBuffer = Buffer.from(`--${boundary}`);
  //   let fileStream = null;
  //   let buffer = Buffer.alloc(0);

  //   req.on("data", (data) => {
  //     buffer = Buffer.concat([buffer, data]);

  //     let boundaryIndex;
  //     while ((boundaryIndex = buffer.indexOf(boundaryBuffer)) !== -1) {
  //       const part = buffer.slice(0, boundaryIndex);
  //       buffer = buffer.slice(boundaryIndex + boundaryBuffer.length);

  //       if (fileStream) {
  //         fileStream.end(part);
  //         fileStream = null;
  //       } else {
  //         const headers = part.toString().split("\r\n");
  //         const dispositionHeader = headers.find(header => header.startsWith("Content-Disposition"));

  //         if (dispositionHeader) {
  //           const match = dispositionHeader.match(/filename="([^"]+)"/);
  //           if (match) {
  //             const filename = match[1];
  //             const filePath = path.join("./uploads", filename);
  //             fileStream = fs.createWriteStream(filePath);
  //             fileStream.write(part.slice(part.indexOf("\r\n\r\n") + 4));
  //             req.file = {
  //               filename,
  //               path: filePath,
  //             };
  //           }
  //         }
  //       }
  //     }
  //   });

  //   req.on("end", () => {
  //     if (fileStream) {
  //       fileStream.end(buffer);
  //     }
  //     this.executeHandlers(req, res, handlers);
  //   });

  //   req.on("error", (error) => {
  //     console.error(error);
  //     res.writeHead(500, { "Content-Type": "text/plain" });
  //     res.end("Internal Server Error");
  //   });
  // }

  handleOtherRequests(req, res, handlers) {
    const contentType = req.headers["content-type"];
    if (contentType) {
      req.file = req;
    }
    this.executeHandlers(req, res, handlers);
  }

  executeHandlers(req, res, handlers) {
    if (this.options.defaultHeaders) {
      for (const [key, value] of Object.entries(this.options.defaultHeaders)) {
        res.setHeader(key, value);
      }
    }

    const allHandlers = [...this.globalMiddlewares, ...handlers];

    const execute = (index) => {
      if (index >= allHandlers.length) return;
      allHandlers[index](req, res, () => execute(index + 1));
    };

    execute(0);
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
