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
9. **File Upload Handling:** Support for single binary file uploads through `req.file`.
10. **Request Timeout:** Configurable timeout for requests to prevent long-running operations.

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
    timeout: 2000, // 2 seconds
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
    res
      .status(201)
      .json({ message: "Successfully received POST data", data: body });
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

## Installing and Using NodeRoute

NodeRoute is available on the npm registry, making it easy to install and use in your Node.js projects. Follow the steps below to get started.

### Installation

To install NodeRoute, you can use npm or yarn. Run the following command in your project directory:

```bash
npm install @ah_naf/noderoute
```

Or, if you prefer using yarn:

```bash
yarn add @ah_naf/noderoute
```

### Example Usage

Here’s a complete example demonstrating how to use NodeRoute in a Node.js application.

#### Project Structure

Create a project structure like this:

```
my-noderoute-app/
├── public/
│   ├── index.html
│   └── custom_404.html
├── index.js
├── package.json
```

#### Setting Up `index.js`

In your `index.js` file, set up the NodeRoute server, define routes, and add middlewares:

```javascript
const path = require("path");
const NodeRoute = require("@ah_naf/noderoute");

const server = new NodeRoute({
  custom404Path: path.join(__dirname, "public", "custom_404.html"),
  defaultHeaders: { "X-Powered-By": "NodeRoute" },
  enableLogging: true,
  bodySizeLimit: 1024, // 1 KB
  timeout: 2000, // 2 seconds
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
  res
    .status(201)
    .json({ message: "Successfully received POST data", data: body });
});

// Serve static files from the 'public' directory
server.route("/").sendStatic(path.join(__dirname, "public"));

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
```

#### `public/index.html`

Create a simple HTML file in the `public` directory:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NodeRoute Example</title>
  </head>
  <body>
    <h1>Welcome to NodeRoute</h1>
    <p>This is a static file served by NodeRoute.</p>
  </body>
</html>
```

#### `public/custom_404.html`

Create a custom 404 error page:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 Not Found</title>
  </head>
  <body>
    <h1>404 - Page Not Found</h1>
    <p>Sorry, the page you are looking for does not exist.</p>
  </body>
</html>
```

#### Running the Server

To start the server, run the following command in your project directory:

```bash
node index.js
```

You should see the following output:

```bash
Server is listening on port 3000
```

#### Accessing the Server

Open your browser and navigate to `http://localhost:3000`. You should see the content of `public/index.html`.

To test the route-based middleware and handlers, navigate to `http://localhost:3000/public`.

### Options

- **custom404Path:** Path to a custom 404 page.
- **defaultHeaders:** Headers to be added to all responses.
- **enableLogging:** Boolean to enable/disable logging. Logs method, URL, status code, and time taken for the request.
- **bodySizeLimit:** Maximum allowed body size for incoming requests.
- **timeout:** Maximum time allowed for a request before it is terminated.
- **Route-Specific Options:** Override global options for specific routes (e.g., `bodySizeLimit`).

### File Upload Handling

NodeRoute supports handling single binary file uploads through the `req.file` stream. This allows for efficient handling of file

uploads without loading the entire file into memory.

Example of handling a file upload:

```javascript
const fs = require("fs");
const uploadRoute = server.route("/upload");

uploadRoute.post((req, res) => {
  const filePath = path.join(__dirname, "uploaded_file.png");
  const writableStream = fs.createWriteStream(filePath);

  req.file.pipe(writableStream);

  writableStream.on("finish", () => {
    res.status(200).json({ message: "File uploaded successfully" });
  });

  writableStream.on("error", (error) => {
    console.error("Error writing file:", error);
    res.status(500).json({ error: "Internal Server Error" });
  });
});
```

In this example, the uploaded file is streamed to the server and saved as `uploaded_file.png` in the current directory. This method ensures that the server can handle large file uploads efficiently without exhausting memory.

### Example with Timeout Route

Here’s an example that demonstrates how to use the timeout option:

```javascript
const path = require("path");
const NodeRoute = require("@ah_naf/noderoute");

const server = new NodeRoute({
  custom404Path: path.join(__dirname, "public", "custom_404.html"),
  defaultHeaders: { "X-Powered-By": "NodeRoute" },
  enableLogging: true,
  bodySizeLimit: 1024, // 1 KB
  timeout: 2000, // 2 seconds
});

const timeoutRoute = server.route("/api/timeout");

timeoutRoute.get((req, res) => {
  // Simulate a long-running operation
  setTimeout(() => {
    res.status(200).json({ message: "This request took a long time" });
  }, 3000); // This will exceed the server timeout
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
```
