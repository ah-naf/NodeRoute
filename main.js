const path = require("path");
const NodeRoute = require("./index");
const fs = require("fs/promises"); // Using promises for cleaner async/await syntax

// Example usage
const server = new NodeRoute();

const PostRoute = server.route("/post/:id/custom");

PostRoute.get((req, res) => {
  const id = req.params.id;
  res.status(200).json({ message: `Successfully fetched post with id ${id}` });
}).post(async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const files = req.files;

  res.status(201).json({ message: `Successfully added post with id ${id}` });
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
