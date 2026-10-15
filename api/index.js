const { start } = require("../src/start");

let ready = null;

function getApp() {
  if (!ready) {
    ready = start({ trustProxy: true }).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

module.exports = async (req, res) => {
  try {
    const { app } = await getApp();
    return app(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("The server isn't configured yet. Check the environment variables in Vercel.");
  }
};
