# NodeRoute

## Overview

The NodeRoute package is a lightweight, flexible HTTP server framework for Node.js, designed to simplify route management, middleware integration, and static file serving. It allows developers to define routes, handle different HTTP methods, and serve static files with ease. NodeRoute is inspired by popular frameworks like Express.js, but it aims to provide a simpler and more modular approach.

## Key Features

1. **Route Management:** Define routes with support for GET, POST, PUT, and DELETE methods.
2. **Middleware Support:** Apply global, route-based global, and route-based local middlewares for request handling.
3. **Static File Serving:** Serve static files from specified directories.
4. **Customizable Response Methods:** Extend response object with custom methods like `sendFile`, `json`, and `status`.
5. **Dynamic URL Parameter Extraction:** Extract and use URL parameters in request handlers.
6. **Configurable Options:** Customize server behavior with options like logging, default headers, body size limits, and custom 404 pages.
7. **Route-Specific Options:** Override global options for specific routes.
8. **Middleware Chaining:** Add middlewares before specific HTTP method handlers.

## How It Works

### Core Classes

#### 1. `NodeRoute`
- Manages the HTTP server, global middlewares, and routes.
- Listens for incoming requests and delegates them to the appropriate route handlers.

#### 2. `Route`
- Defines and manages individual routes and their handlers.
- Supports middleware chaining and static file route setup.

### Methods and Usage

#### `NodeRoute`

- **Constructor:** Initializes the server with optional configurations.
  ```javascript
  const server = new NodeRoute({
    custom404Path: path.join(__dirname, "public", "custom_404.html"),
    defaultHeaders: { "X-Powered-By": "NodeRoute" },
    enableLogging: true,
    bodySizeLimit: 1024, // 1 KB
  });
  ```

- **use(middleware):** Adds a global middleware.
  ```javascript
  server.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  ```

- **route(path, options):** Defines a new route with optional configurations.
  ```javascript
  const publicRoute = server.route("/public", { bodySizeLimit: 2048 });
  ```

- **listen(port, callback):** Starts the server on the specified port.
  ```javascript
  server.listen(3000, () => {
    console.log("Server is listening on port 3000");
  });
  ```

#### `Route`

- **get(...handlers):** Defines a GET handler for the route.
  ```javascript
  publicRoute.get((req, res) => {
    res.status(200).json({ message: "Successfully accessed public route" });
  });
  ```

- **post(...handlers):** Defines a POST handler for the route.
  ```javascript
  publicRoute.post((req, res) => {
    const body = req.body;
    res.status(201).json({ message: "Successfully received POST data", data: body });
  });
  ```

- **put(...handlers):** Defines a PUT handler for the route.
- **delete(...handlers):** Defines a DELETE handler for the route.

- **use(...middlewares):** Adds middlewares specific to the route.
  ```javascript
  publicRoute.use((req, res, next) => {
    console.log(`Middleware for ${req.method} ${req.url}`);
    next();
  });
  ```

- **sendStatic(staticDir, options):** Serves static files from the specified directory.
  ```javascript
  server.route("/").sendStatic(path.join(__dirname, "public"));
  ```

### Middleware Levels

1. **Global Middleware:** Applied to all routes.
   ```javascript
   server.use((req, res, next) => {
     console.log(`Global middleware: ${req.method} ${req.url}`);
     next();
   });
   ```

2. **Route-Based Global Middleware:** Applied to all handlers within a specific route.
   ```javascript
   const publicRoute = server.route("/public");
   publicRoute.use((req, res, next) => {
     console.log(`Route-based global middleware: ${req.method} ${req.url}`);
     next();
   });
   ```

3. **Route-Based Local Middleware:** Applied before specific HTTP method handlers.
   ```javascript
   publicRoute.get(
     (req, res, next) => {
       console.log("Local middleware for GET /public");
       next();
     },
     (req, res) => {
       res.status(200).json({ message: "Successfully accessed public route" });
     }
   );
   ```

### Example Usage

```javascript
const path = require("path");
const NodeRoute = require("./index");

const server = new NodeRoute({
  custom404Path: path.join(__dirname, "public", "custom_404.html"),
  defaultHeaders: { "X-Powered-By": "NodeRoute" },
  enableLogging: true,
  bodySizeLimit: 1024, // 1 KB
});

// Global middleware
server.use((req, res, next) => {
  console.log(`Global middleware: ${req.method} ${req.url}`);
  next();
});

const publicRoute = server.route("/public", { bodySizeLimit: 2048 });

// Route-based global middleware
publicRoute.use((req, res, next) => {
  console.log(`Route-based global middleware: ${req.method} ${req.url}`);
  next();
});

// Route-based local middleware
publicRoute.get(
  (req, res, next) => {
    console.log("Local middleware for GET /public");
    next();
  },
  (req, res) => {
    res.status(200).json({ message: "Successfully accessed public route" });
  }
);

publicRoute.post((req, res) => {
  const body = req.body;
  res.status(201).json({ message: "Successfully received POST data", data: body });
});

// Serve static files from the 'public' directory
server.route("/").sendStatic(path.join(__dirname, "public"));

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
```

### Options

- **custom404Path:** Path to a custom 404 page.
- **defaultHeaders:** Headers to be added to all responses.
- **enableLogging:** Boolean to enable/disable logging.
- **bodySizeLimit:** Maximum allowed body size for incoming requests.
- **Route-Specific Options:** Override global options for specific routes (e.g., `bodySizeLimit`).

### Drawbacks

- **Limited Features:** Compared to mature frameworks like Express.js, NodeRoute offers fewer built-in features.
- **Manual Middleware Management:** Middleware chaining is manual and requires careful order management.
- **No Built-in Body Parsing:** Requires custom handling for different content types.

## Conclusion

NodeRoute is a simple yet powerful package for building HTTP servers in Node.js. It provides essential functionalities for routing, middleware management, and static file serving while allowing for customization through various options. Although it may not be as feature-rich as some other frameworks, it offers a straightforward and modular approach to building web applications. The ability to override global options for specific routes and support for multiple levels of middleware adds flexibility, making it easier to manage route-specific requirements.