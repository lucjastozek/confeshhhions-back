import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Client } from "pg";
import { getEnvVarOrFail } from "./support/envVarUtils";
import { setupDBClientConfig } from "./support/setupDBClientConfig";
import * as bcrypt from "bcrypt";

dotenv.config(); //Read .env file lines as though they were env vars.

const dbClientConfig = setupDBClientConfig();
const client = new Client(dbClientConfig);

//Configure express routes
const app = express();

app.use(express.json()); //add JSON body parser to each following route handler
app.use(cors()); //add CORS support to each following route handler

app.get("/", async (_req, res) => {
    res.json({ msg: "Hello! There's nothing interesting for GET /" });
});

app.get("/health-check", async (_req, res) => {
    try {
        //For this to be successful, must connect to db
        await client.query("select now()");
        res.status(200).send("system ok");
    } catch (error) {
        //Recover from error rather than letting system halt
        console.error(error);
        res.status(500).send("An error occurred. Check server logs.");
    }
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await client.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
            [username, hashedPassword]
        );
        res.status(200).json(user.rows[0]);
        res.status(200).send("system ok");
    } catch (error) {
        //Recover from error rather than letting system halt
        console.error(error);
        res.status(500).send("An error occurred. Check server logs.");
    }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await client.query(
            "SELECT * FROM users WHERE username = $1",
            [username]
        );

        if (user.rows.length === 0) {
            return res.status(401).json({ message: "Invalid username" });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.rows[0].password
        );

        if (validPassword) {
            res.status(200).json(user.rows[0]);
        } else {
            res.status(401).json({ message: "Authentication failed" });
        }
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.post("/confessions", async (req, res) => {
    const { text } = req.body;
    try {
        const confession = await client.query(
            "INSERT INTO confessions (text) VALUES ($1) RETURNING *",
            [text]
        );

        res.status(200).json(confession.rows[0]);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.get("/confessions", async (_req, res) => {
    try {
        const confessions = await client.query("SELECT * FROM confessions");

        res.status(200).json(confessions.rows);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.get("/confessions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const confession = await client.query(
            "SELECT * FROM confessions WHERE id = $1",
            [id]
        );

        res.status(200).json(confession.rows[0]);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.put("/confessions/:id/upvote", async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const confession = await client.query(
            "UPDATE confessions SET votes = (SELECT votes FROM confessions WHERE id = $1) + 1 WHERE id = $1 RETURNING *",
            [id]
        );

        res.status(200).json(confession.rows[0]);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

app.put("/confessions/:id/downvote", async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const confession = await client.query(
            "UPDATE confessions SET votes = (SELECT votes FROM confessions WHERE id = $1) - 1 WHERE id = $1 RETURNING *",
            [id]
        );

        res.status(200).json(confession.rows[0]);
    } catch (error) {
        console.error(`Error: ${error}`);
        res.status(500).json({ message: "An error occurred" });
    }
});

connectToDBAndStartListening();

async function connectToDBAndStartListening() {
    console.log("Attempting to connect to db");
    await client.connect();
    console.log("Connected to db!");

    const port = getEnvVarOrFail("PORT");
    app.listen(port, () => {
        console.log(
            `Server started listening for HTTP requests on port ${port}.  Let's go!`
        );
    });
}
