const NodeRoute = require("./index");
const path = require("path");

const SESSIONS = [];

const USERS = [
  { id: 1, name: "Ahnaf Hasan", username: "ahnaf", password: "string" },
  { id: 2, name: "Hasan Shifat", username: "shifat", password: "string" },
  { id: 3, name: "John Doe", username: "john", password: "string" },
];

const POSTS = [
  {
    id: 1,
    title: "This is a post title",
    body: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
    userId: 1,
  },
];

const PORT = 3000;
const server = new NodeRoute({enableLoggin: true});

const authenticate = (req, res, next) => {
  if (req.headers.cookie) {
    const headers = req.headers.cookie;
    const headersParsed = headers.split("; ");
    const token = headersParsed[headersParsed.length - 1].split("=")[1];

    const session = SESSIONS.find((session) => session.token === token);
    if (session) {
      req.userId = session.userId;
      return next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const HomeRoute = server.route("/");
const LoginRoute = server.route("/api/login");
const LogoutRoute = server.route("/api/logout");
const UserRoute = server.route("/api/user");
const PostRoute = server.route("/api/posts");

HomeRoute.sendStatic(path.join(__dirname, "public"));

LoginRoute.post((req, res) => {
  const body = req.body;
  const username = body.username;
  const password = body.password;
  const user = USERS.find((user) => user.username === username);

  if (user && user.password === password) {
    const token = Math.floor(Math.random() * 100000).toString();

    SESSIONS.push({ userId: user.id, token });

    res.setHeader("Set-Cookie", `token=${token}; Path=/;`);

    res.status(200).json({ message: "Logged in successfully!" });
  } else {
    res.status(401).json({ error: "Invalid username or password" });
  }
});

LogoutRoute.delete(authenticate, (req, res) => {
  // Remove the session object form the SESSIONS array
  const sessionIndex = SESSIONS.findIndex(
    (session) => session.userId === req.userId
  );
  if (sessionIndex > -1) {
    SESSIONS.splice(sessionIndex, 1);
  }
  res.setHeader(
    "Set-Cookie",
    `token=deleted; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  res.status(200).json({ message: "Logged out successfully!" });
});

UserRoute.use(authenticate);

UserRoute.get((req, res) => {
  const user = USERS.find((user) => user.id === req.userId);
  res.json({ username: user.username, name: user.name });
}).put((req, res) => {
  const { username, name, password } = req.body;

  const user = USERS.find((user) => user.id === req.userId);

  user.username = username;
  user.name = name;
  if (password) user.password = password;
  res.status(200).json({ username: user.username, name: user.name });
});

PostRoute.get((req, res) => {
  const posts = POSTS.map((post) => {
    const user = USERS.find((user) => user.id === post.userId);
    post.author = user.name;
    return post;
  });
  res.status(200).json(posts);
}).post(authenticate, (req, res) => {
  const title = req.body.title;
  const body = req.body.body;

  const post = {
    id: POSTS.length + 1,
    title,
    body,
    userId: req.userId,
  };

  POSTS.unshift(post);
  res.status(201).json(post);
});

server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});