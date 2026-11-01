process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration_test_secret_123456";
delete process.env.GEMINI_API_KEY; // tests must be deterministic and offline

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const app = require("../../src/app");
const User = require("../../src/models/User");
const Resource = require("../../src/models/Resource");
const config = require("../../src/services/config.service");

const URI = process.env.MONGODB_URI_TEST || "mongodb://127.0.0.1:27017/ps9_integration_test";
const PASSWORD = "Passw0rd!test";

async function setup() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  config.reset();

  const hash = await bcrypt.hash(PASSWORD, 4);
  const mk = (name, role) => User.create({ name, email: `${role}.${name}@test.com`.toLowerCase(), passwordHash: hash, role });
  const users = {
    admin: await mk("a", "admin"),
    operator: await mk("o", "operator"),
    responder1: await mk("r1", "responder"),
    responder2: await mk("r2", "responder"),
    citizen: await mk("c", "citizen"),
    hospital: await mk("h", "hospital"),
  };

  const tokens = {};
  for (const [k, u] of Object.entries(users)) {
    const res = await request(app).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD });
    tokens[k] = res.body.data.token;
  }

  const P = (lon, lat) => ({ type: "Point", coordinates: [lon, lat] });
  const base = [72.5714, 23.0225];
  const units = [
    ["FT-01", "fire_team", ["fire_suppression", "rescue"], 0.005, users.responder1],
    ["FT-02", "fire_team", ["fire_suppression"], 0.02, users.responder2],
    ["AMB-01", "ambulance", ["medical", "trauma", "transport"], 0.008, users.responder1],
    ["PU-01", "police", ["traffic_control", "crowd_control", "security"], 0.01, users.responder2],
    ["RST-01", "rescue", ["search_rescue", "rescue"], 0.01, users.responder2],
  ];
  for (const [publicId, type, capabilities, d, resp] of units) {
    await Resource.create({ publicId, name: publicId, type, capabilities, status: "available", location: P(base[0] + d, base[1]), responderUser: resp._id });
  }
  await Resource.create({ publicId: "HOS-01", name: "Hospital", type: "hospital", capabilities: ["emergency"], status: "available", location: P(base[0], base[1]) });

  return { users, tokens, app, base };
}

async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const report = (lon, lat, description, extra = {}) => ({ description, location: { type: "Point", coordinates: [lon, lat] }, address: "Test St", ...extra });

module.exports = { setup, teardown, auth, report, request };
