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
const borrowsCollection = client.db('booknook').collection('borrows');

// ============ POST /books — New book add ============
app.post('/books', async (req, res) => {
  try {
    const { title, author, category, image, description, totalCopies,
            publicationYear, language, publisher, addedByName, addedByEmail } = req.body;

    if (!title || !author || !category) {
      return res.status(400).send({ message: 'Missing required fields' });
    }

    const newBook = {
      title: String(title).trim(),
      author: String(author).trim(),
      category: String(category).trim(),
      image: image || '',
      description: description || '',
      totalCopies: Number(totalCopies) || 0,
      publicationYear: publicationYear ? Number(publicationYear) : null,
      language: language || 'English',
      publisher: publisher || '',
      addedByName: addedByName || 'Anonymous',
      addedByEmail: addedByEmail || '',
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);
    res.status(201).send({ message: 'Book added successfully', insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: 'Failed to add book', error: error.message });
  }
});

// ============ GET /books — All book (optional ?limit=N) ============
app.get('/books', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit);

    let cursor = booksCollection.find().sort({ createdAt: -1 });

    if (Number.isInteger(limit) && limit > 0) {
      cursor = cursor.limit(limit);
    }

    const books = await cursor.toArray();
    res.status(200).send(books);
  } catch (error) {
    res.status(500).send({ message: 'Failed to get books', error: error.message });
  }
});

// ============ GET /books/:id — One book ============
app.get('/books/:id', async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid book ID' });
    }

    const book = await booksCollection.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).send({ message: 'Book not found' });
    }

    res.status(200).send(book);
  } catch (error) {
    res.status(500).send({ message: 'Failed to get book', error: error.message });
  }
});

// ============ PATCH /books/:id — book edit ============
app.patch('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid book id' });
    }

    // shudhu je field gulo pathano hoyeche segulo update korbo
    const allowedFields = [
      'title', 'author', 'category', 'image', 'description',
      'totalCopies', 'publicationYear', 'language', 'publisher',
      'addedByName', 'addedByEmail',
    ];
    const updateDoc = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateDoc[field] = req.body[field];
    }
    if (updateDoc.totalCopies !== undefined) updateDoc.totalCopies = Number(updateDoc.totalCopies);
    if (updateDoc.publicationYear !== undefined) updateDoc.publicationYear = Number(updateDoc.publicationYear);

    if (Object.keys(updateDoc).length === 0) {
      return res.status(400).send({ message: 'No fields to update' });
    }

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );
    if (result.matchedCount === 0) {
      return res.status(404).send({ message: 'Book not found' });
    }
    res.send({ message: 'Book updated successfully', modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).send({ message: 'Failed to update book', error: error.message });
  }
});

// ============ DELETE /books/:id — book delete ============
app.delete('/books/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid book id' });
    }
    const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: 'Book not found' });
    }
    res.send({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to delete book', error: error.message });
  }
});

// ============ POST /borrows — borrow book ============
app.post('/borrows', async (req, res) => {
  try {
    const { bookId, email } = req.body;
    if (!bookId || !email) {
      return res.status(400).send({ message: 'bookId and email are required' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).send({ message: 'Invalid email' });
    }
    if (!ObjectId.isValid(bookId)) {
      return res.status(400).send({ message: 'Invalid bookId' });
    }

    const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) {
      return res.status(404).send({ message: 'Book not found' });
    }

    // server-side duplicate check: ei user ei book already niyeche kina
    const already = await borrowsCollection.findOne({ bookId: bookId, email: email });
    if (already) {
      return res.status(409).send({ message: 'You have already borrowed this book. Return it first.' });
    }

    // atomic decrement: totalCopies 0 ba tar kom hole update-i hobe na
    const updated = await booksCollection.updateOne(
      { _id: book._id, totalCopies: { $gt: 0 } },
      { $inc: { totalCopies: -1 } }
    );
    if (updated.modifiedCount === 0) {
      return res.status(409).send({ message: 'This book is not available right now' });
    }

    // borrow record e book er info snapshot — book delete holeo history dekhabe
    const borrowDate = new Date();
    const borrow = {
      bookId: bookId,
      email: email,
      bookTitle: book.title,
      bookImage: book.image,
      category: book.category,
      borrowDate: borrowDate,
      dueDate: new Date(borrowDate.getTime() + 7 * 24 * 60 * 60 * 1000),
    };
    const result = await borrowsCollection.insertOne(borrow);
    res.status(201).send({ message: 'Book borrowed successfully', insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: 'Failed to borrow book', error: error.message });
  }
});

// ============ GET /borrows — sob borrows, ba ?email= diye filter ============
app.get('/borrows', async (req, res) => {
  try {
    const filter = {};
    if (req.query.email) {
      filter.email = req.query.email;
    }
    const borrows = await borrowsCollection
      .find(filter)
      .sort({ borrowDate: -1 })
      .toArray();
    res.send(borrows);
  } catch (error) {
    res.status(500).send({ message: 'Failed to get borrows', error: error.message });
  }
});

// ============ DELETE /borrows/:id — return kora ============
app.delete('/borrows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid borrow id' });
    }
    const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) });
    if (!borrow) {
      return res.status(404).send({ message: 'Borrow record not found' });
    }
    // borrow record delete + book er copy abar jog (+1) — challenge er $inc logic
    await borrowsCollection.deleteOne({ _id: borrow._id });
    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { totalCopies: 1 } }
    );
    res.send({ message: 'Book returned successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to return book', error: error.message });
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