const path = require("path");
const fsStream = require("fs");

/**
 * Mime types for different file extensions.
 */
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

/**
 * Serve a 404 page when a file is not found or there's an error.
 * @param {http.ServerResponse} res - The response object.
 */
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

/**
 * Serve a static file to the response.
 * @param {string} filePath - The path to the file.
 * @param {http.ServerResponse} res - The response object.
 */
async function serveStaticFile(filePath, res) {
  try {
    const stat = await fsStream.promises.lstat(filePath);

    if (stat.isDirectory()) {
      throw new Error("EISDIR"); // Error if it's a directory
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

module.exports = { serve404, mimeTypes, serveStaticFile };
