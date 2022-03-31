const axios = require("axios").default;
const knex = require("knex");
const express = require("express");
const app = express();
const cors = require("cors");
const bcrypt = require("bcryptjs");

app.use(cors());

app.use(express.json());

const pg = knex({
  client: "pg",
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});

app.get("/allcoins", async (req, res) => {
  const allcoins = await pg.raw("SELECT * FROM allcoins");
  const coins = allcoins.rows;
  coins.map((coin) => {
    console.log(
      `INSERT INTO allcoins VALUES (${coin.id}, '${coin.name}', '${coin.symbol}', '${coin.type}', '${coin.slug}');`
    );
  });

  res.send(allcoins.rows);
});

app.get("/getcoins", async (req, res) => {
  const getFiat = await pg.raw("SELECT * FROM fiatcoins ORDER BY name ASC");
  const getCrypto = await pg.raw("SELECT * FROM cryptocoins ORDER BY name ASC");
  let result = Object.assign(
    { fiat: getFiat.rows },
    { crypto: getCrypto.rows }
  );
  res.send(result);
});

app.post("/registerUser", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (name === "" || email === "" || password === "")
      return res.send({ success: false });
    const hashedPassword = await bcrypt.hash(password, 1);
    await pg.raw(
      `INSERT INTO users (name, email, password) VALUES ('${name}', '${email}', '${hashedPassword}')`
    );

    res.send({ success: true });
  } catch (e) {
    if (e.code == 23505)
      res.send(
        Object.assign({ success: false }, { message: "User already exists" }, e)
      );
  }
});

app.post("/userLogin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === "" || password === "") return res.send({ success: false });
    const query = await pg.raw(`SELECT * FROM users WHERE email = '${email}'`);
    if (query.rows.length === 0)
      return res.send({
        status: { success: false, message: "Email not found" },
      });
    const dbPassword = query.rows[0].password;
    const validPassword = await bcrypt.compare(password, dbPassword);
    if (!validPassword)
      return res.send({
        status: { success: false, message: "Passwords don't match" },
      });
    res.send({
      status: {
        success: true,
      },
      userInfo: query.rows[0],
    });
  } catch (e) {
    res.send({ status: { success: false }, message: e });
  }
});

app.post("/convert", async (req, res) => {
  console.log(req.body);
  let fromCoin, toCoin;
  const checkCoin = await pg.raw(
    `SELECT * FROM allcoins where id IN (${req.body.from},${req.body.to}) ORDER BY id`
  );
  if (req.body.from === req.body.to)
    return res.send({
      success: true,
      conversionPrice: 1,
      fromCoin: checkCoin.rows[0],
      toCoin: checkCoin.rows[0],
    });
  if (checkCoin.rows.length !== 2) return res.send("Error");
  if (req.body.from < req.body.to) {
    fromCoin = checkCoin.rows[0];
    toCoin = checkCoin.rows[1];
  } else {
    fromCoin = checkCoin.rows[1];
    toCoin = checkCoin.rows[0];
  }
  const request = await axios.get(
    `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?id=${fromCoin.id.toString()}&convert_id=${toCoin.id.toString()}`,
    {
      headers: {
        "X-CMC_PRO_API_KEY": process.env.API_KEY,
      },
    }
  );

  const result = {
    success: true,
    conversionPrice:
      request.data.data[`${fromCoin.id}`].quote[`${toCoin.id}`]["price"],
    fromCoin: fromCoin,
    toCoin: toCoin,
  };
  res.json(result);
});

app.listen(process.env.PORT || 3001);
