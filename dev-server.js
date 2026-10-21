// Local preview server. Run with: node dev-server.js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const files = new Set([
  "sign-in.html",
  "so-dashboard.html",
  "so-audit.html",
  "admin.html",
  "admin-accounts.html",
  "admin-account-create.html",
  "admin-account-edit.html",
  "admin-locations.html",
  "admin-location-create.html",
  "admin-location-edit.html",
  "styles.css",
  "api-config.js",
  "api.js",
  "app.js"
]);
const contentTypes = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const oldPages = new Map([
  ["/index.html", "/sign-in.html"],
  ["/so-incidents.html", "/so-dashboard.html"],
  ["/so-incident.html", "/so-dashboard.html"]
]);
const port = Number(process.env.PORT || 5500);

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const redirect = oldPages.get(url.pathname);
  if (redirect) {
    response.writeHead(308, { Location: redirect + url.search }).end();
    return;
  }
  const filename = url.pathname === "/" ? "sign-in.html" : url.pathname.slice(1);
  if (!files.has(filename)) {
    response.writeHead(404).end("Not found");
    return;
  }

  fs.readFile(path.join(__dirname, filename), (error, content) => {
    if (error) {
      response.writeHead(500).end("Could not read file");
      return;
    }
    response.writeHead(200, {
      "Content-Type": `${contentTypes[path.extname(filename)]}; charset=utf-8`,
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`MineSafe web preview: http://127.0.0.1:${port}`);
});
