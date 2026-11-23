
import { ObjectId, MongoClient } from 'mongodb';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

const booksCollection = client.db('booknook').collection('books');

// POST: Add a new book
app.post('/books', async (req, res) => {
    try {
        const book = req.body;

        if (!book.title || !book.author || !book.category) {
            return res.status(400).send({
                message: 'Missing required fields'
            });
        }

        const newBook = {
            ...book,
            createdAt: new Date()
        };

        const result = await booksCollection.insertOne(newBook);

        res.status(201).send({
            message: 'Book added successfully',
            insertedId: result.insertedId
        });

    } catch (error) {
        res.status(500).send({
            message: 'Failed to add book',
            error: error.message
        });
    }
});

// GET: Get all books
app.get('/books', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit);

        let cursor = booksCollection
            .find()
            .sort({ createdAt: -1 });

        if (Number.isInteger(limit) && limit > 0) {
            cursor = cursor.limit(limit);
        }

        const books = await cursor.toArray();

        res.status(200).send(books);

    } catch (error) {
        res.status(500).send({
            message: 'Failed to get books',
            error: error.message
        });
    }
});

// GET: Get a single book by ID
app.get('/books/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: 'Invalid book ID'
            });
        }

        const book = await booksCollection.findOne({
            _id: new ObjectId(id)
        });

        if (!book) {
            return res.status(404).send({
                message: 'Book not found'
            });
        }

        res.status(200).send(book);

    } catch (error) {
        res.status(500).send({
            message: 'Failed to get book',
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.send('BookNook server is running!');
});

// Connect to MongoDB before starting server
async function startServer() {
    try {
        await client.connect();

        console.log('You successfully connected to MongoDB!');

        app.listen(port, () => {
            console.log(`BookNook server is listening on port ${port}`);
        });

    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
    }
}

startServer();
