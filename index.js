const http = require("http");
const fs = require("fs").promises;
const fsStream = require("fs");
const path = require("path");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain",
};

function serve404(res) {
  const filePath = path.join(__dirname, "public", "404.html");
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html");

  const readStream = fsStream.createReadStream(filePath);

  readStream.on("error", (error) => {
    console.error("Error serving 404 page:", error);
    res.setHeader("Content-Type", "text/plain");
    res.end("404 - Not Found");
  });

  readStream.pipe(res);
}

class Route {
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
  }

  validateHandler(handler) {
    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }
  }

  registerHandler(method, handler) {
    if (this.handlers[method]) {
      throw new Error(
        `${method} handler for path "${this.path}" is already defined`
      );
    }
    this.validateHandler(handler);
    this.handlers[method] = handler;
  }

  get(handler) {
    this.registerHandler("GET", handler);
    return this; // Return this for chaining
  }

  post(handler) {
    this.registerHandler("POST", handler);
    return this; // Return this for chaining
  }

  put(handler) {
    this.registerHandler("PUT", handler);
    return this; // Return this for chaining
  }

  delete(handler) {
    this.registerHandler("DELETE", handler);
    return this; // Return this for chaining
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

  async serveStaticFile(filePath, res) {
    try {
      const stat = await fs.lstat(filePath); // Check if the file exists and if it's a file or directory

      if (stat.isDirectory()) {
        throw new Error("EISDIR"); // Throw an error if it's a directory
      }

      const fileStream = fsStream.createReadStream(filePath);
      const ext = path.extname(filePath);
      const mimeType = mimeTypes[ext] || "application/octet-stream";

      res.setHeader("Content-Type", mimeType);
      fileStream.pipe(res);

      fileStream.on("error", (error) => {
        console.error("Error serving static file:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      });
    } catch (error) {
      if (error.message === "EISDIR" || error.code === "ENOENT") {
        console.error("Error serving static file:", error);
        serve404(res); // Serve the 404 page if the file does not exist or is a directory
      } else {
        console.error("Unexpected error serving static file:", error);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    }
  }

  async handleRequest(req, res) {
    const urlPath = req.url === "/" ? "/index.html" : req.url;

    if (this.staticRoutes.has(urlPath) && req.method === "GET") {
      const filePath = this.staticRoutes.get(urlPath);
      await this.serveStaticFile(filePath, res);
    } else {
      const method = req.method.toUpperCase();
      const handler = this.handlers[method];

      if (handler) {
        handler(req, res);
      } else {
        serve404(res);
      }
    }
  }

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

    return this; // Return this for chaining
  }
}

class MyHttp {
  constructor() {
    this.server = http.createServer();
    this.routes = [];

    this.server.on("request", async (req, res) => {
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
      // First, check for static routes
      let staticRoute = this.routes.find(
        (route) => route.staticRoutes.has(req.url) && req.method === "GET"
      );

      if (staticRoute) {
        const filePath = staticRoute.staticRoutes.get(req.url);
        await staticRoute.serveStaticFile(filePath, res);
      } else {
        staticRoute = this.routes.find((route) => {
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

          await staticRoute.serveStaticFile(filePath, res);
        } else {
          // Fallback to dynamic routes
          const route = this.routes.find((route) => req.url === route.path);
          if (route) {
            await route.handleRequest(req, res);
          } else {
            // Serve the custom 404 page
            serve404(res);
          }
        }
      }
    });
  }

  Route(path) {
    if (this.routes.some((route) => route.path === path)) {
      throw new Error(`Route for path "${path}" is already defined`);
    }
    const route = new Route(path);
    this.routes.push(route);
    return route;
  }

  listen(port, cb) {
    this.server.listen(port, cb);
  }
}

// Example usage
const server = new MyHttp();

const homeUrl = "/";

// const homeRoute = server.Route(homeUrl).sendStatic(path.join(__dirname, "public"));

const someRoute = server
  .Route("/another")
  .sendStatic(path.join(__dirname, "public1"));

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
