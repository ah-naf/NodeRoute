const http = require("http");
const fs = require("fs").promises;
const path = require("path");
const { serve404, mimeTypes, serveStaticFile } = require("./utils");
const Route = require("./Route");

class NodeRoute {
  #server;
  #routes;
  #globalMiddlewares;
  constructor(options = {}) {
    this.#server = http.createServer();
    this.#routes = [];
    this.#globalMiddlewares = [];
    this.options = options;

    if (this.options.timeout) {
      this.#server.setTimeout(this.options.timeout);
    }

    this.#server.on("request", async (req, res) => {
      const startTime = process.hrtime();

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

      const logRequest = () => {
        const diff = process.hrtime(startTime);
        const timeTaken = (diff[0] * 1e9 + diff[1]) / 1e9;
        if (this.options.enableLogging) {
          console.log(
            `${req.method} ${req.url} ${res.statusCode} ${timeTaken.toFixed(
              3
            )}s`
          );
        }
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
        // logRequest();
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

      res.on("finish", logRequest);

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
