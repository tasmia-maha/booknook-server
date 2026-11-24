import { ObjectId, MongoClient } from 'mongodb';
import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

dns.setDefaultResultOrder('ipv4first');
// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Multer Configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const app = express();
const port = process.env.PORT || 5050;

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(process.env.MONGODB_URI);

let clientPromise;

async function connectToDatabase(req, res, next) {
  try {
    if (!clientPromise) {
      clientPromise = client.connect();
    }

    await clientPromise;
    next();
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);

    res.status(500).send({
      message: 'Database connection failed',
    });
  }
}

app.use(connectToDatabase);

const booksCollection = client.db('booknook').collection('books');
const borrowsCollection = client.db('booknook').collection('borrows');
const usersCollection = client.db('booknook').collection('users');


const verifyToken = async (req, res, next) => {
  try {
    // 1. Get token from cookie
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).send({
        message: 'Unauthorized. Please login first.',
      });
    }

    // 2. Verify JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // 3. Find user from database
    const user = await usersCollection.findOne({
      _id: new ObjectId(decoded.userId),
    });

    if (!user) {
      return res.status(401).send({
        message: 'User not found.',
      });
    }

    // 4. Attach user to request
    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      location: user.location || '',
      createdAt: user.createdAt || null,
    };

    // 5. Continue to next middleware or route
    next();

  } catch (error) {
    return res.status(401).send({
      message: 'Invalid or expired token.',
    });
  }
};

app.get('/auth/me', verifyToken, async (req, res) => {
  try {
    res.status(200).send({
      message: 'User authenticated successfully.',
      user: req.user,
    });

  } catch (error) {
    console.error('Auth me error:', error);

    res.status(500).send({
      message: 'Internal server error.',
    });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  res.status(200).send({
    message: 'Logout successful!',
  });
});

  // ============ PATCH /auth/profile — profile edit ============
app.patch('/auth/profile', verifyToken, async (req, res) => {
  try {
    const { name, location } = req.body;

    // 1. Validate — name required, location optional
    if (!name || !String(name).trim()) {
      return res.status(400).send({ message: 'Name is required.' });
    }

    const newName = String(name).trim();
    const newLocation = location ? String(location).trim() : '';

    // 2. Update user document (verifyToken already confirmed the identity)
    const result = await usersCollection.updateOne(
      { _id: req.user.id },
      { $set: { name: newName, location: newLocation } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: 'User not found.' });
    }

    // 3. Name change hole books eo propagate kori — addedByName live display
    //    data (all-books / book details / my books e dekhabe).
    //    borrow record er "contributor" historical snapshot — oita touch kori na.
    if (newName !== req.user.name) {
      await booksCollection.updateMany(
        { addedByEmail: req.user.email },
        { $set: { addedByName: newName } }
      );
    }

    // 4. Updated user pathai — frontend context er setUser er jonno ready
    res.status(200).send({
      message: 'Profile updated successfully.',
      user: {
        id: req.user.id,
        name: newName,
        email: req.user.email,
        location: newLocation,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).send({ message: 'Internal server error.' });
  }
});

// ============ POST /upload — Upload book cover ============
app.post('/upload', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({
        message: 'Please select an image.',
      });
    }

    const imageUrl = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'booknook/covers',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );

      stream.end(req.file.buffer);
    });

    res.status(200).send({
      message: 'Image uploaded successfully!',
      imageUrl,
    });

  } catch (error) {
    console.error('Cloudinary upload error:', error);

    res.status(500).send({
      message: 'Image upload failed.',
    });
  }
});

// ============ POST /books — New book add ============
app.post('/books', verifyToken, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
      publicationYear,
      language,
      publisher,
    } = req.body;

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
      addedByName: req.user.name,
      addedByEmail: req.user.email,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);
    res.status(201).send({ message: 'Book added successfully', insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: 'Failed to add book', error: error.message });
  }
});

//======Register======
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Check required fields
    if (!name || !email || !password) {
      return res.status(400).send({
        message: 'Name, email and password are required.',
      });
    }

    // 2. Normalize input
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Validate password length
    if (password.length < 8) {
      return res.status(400).send({
        message: 'Password must be at least 8 characters.',
      });
    }

    // 4. Check existing user
    const existingUser = await usersCollection.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).send({
        message: 'Email already registered.',
      });
    }

    // 5. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 6. Create user
    const newUser = {
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      createdAt: new Date(),
    };

    // 7. Save user in MongoDB
    const result = await usersCollection.insertOne(newUser);

    res.status(201).send({
      message: 'Registration successful!',
      userId: result.insertedId,
    });

  } catch (error) {
    console.error('Registration error:', error);

    res.status(500).send({
      message: 'Internal server error.',
    });
  }
});

//======Login======
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check required fields
    if (!email || !password) {
      return res.status(400).send({
        message: 'Email and password are required.',
      });
    }

    // 2. Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Find user
    const user = await usersCollection.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).send({
        message: 'Invalid email or password.',
      });
    }

    // 4. Compare password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).send({
        message: 'Invalid email or password.',
      });
    }

    // 5. Generate JWT token
    const token = jwt.sign(
      { userId: user._id.toString() },
        process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    // 6. Store token in HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    // 7. Send response
    res.status(200).send({
      message: 'Login successful!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        location: user.location || '',
        createdAt: user.createdAt || null,
      },
    });
    } catch (error) {
      console.error('Login error:', error);

    res.status(500).send({
      message: 'Internal server error.',
    });
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
app.patch('/books/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid book id' });
    }
    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({ message: 'Book not found' });
    }

    if (book.addedByEmail !== req.user.email) {
      return res.status(403).send({
        message: 'You are not allowed to update this book',
      });
    }

    const allowedFields = [
      'title', 'author', 'category', 'image', 'description',
      'totalCopies', 'publicationYear', 'language', 'publisher',
    ];
    const updateDoc = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateDoc[field] = req.body[field];
    }
    if (updateDoc.publicationYear !== undefined) updateDoc.publicationYear = Number(updateDoc.publicationYear);

    // totalCopies = user er deya "Total Copies" (sob copy mil).
    // backend borrowed copy count kore available update kore.
    // DB te stored totalCopies asole "available copies" — borrow/return e $inc hoy
    if (updateDoc.totalCopies !== undefined) {
      const newTotal = Number(updateDoc.totalCopies);
      if (!Number.isInteger(newTotal) || newTotal < 0) {
        return res.status(400).send({ message: 'Invalid totalCopies' });
      }
      const borrowed = await borrowsCollection.countDocuments({ bookId: id });
      if (newTotal < borrowed) {
        return res.status(409).send({ message: `Total copies cannot be less than ${borrowed} borrowed copies` });
      }
      updateDoc.totalCopies = newTotal - borrowed;
    }

    if (Object.keys(updateDoc).length === 0) {
      return res.status(400).send({ message: 'No fields to update' });
    }

    const result = await booksCollection.updateOne(
      { _id: book._id, addedByEmail: req.user.email },
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
app.delete('/books/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid book id' });
    }
    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({ message: 'Book not found' });
    }

    if (book.addedByEmail !== req.user.email) {
      return res.status(403).send({
        message: 'You are not allowed to delete this book',
      });
    }
    // active borrow thakle delete block — age copy gulo return korte hobe
    const activeBorrow = await borrowsCollection.findOne({ bookId: id });
    if (activeBorrow) {
      return res.status(409).send({ message: 'This book has active borrows. Return all copies before deleting it.' });
    }

    await booksCollection.deleteOne({
      _id: book._id,
    });
    res.send({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Failed to delete book', error: error.message });
  }
});

// ============ POST /borrows — borrow book ============
app.post('/borrows', verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body;

      if (!bookId) {
        return res.status(400).send({ message: 'bookId is required' });
      }

    const email = req.user.email;
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
      bookAuthor: book.author || "",
      bookImage: book.image,
      category: book.category,
      contributor: book.addedByName || "",
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
app.get('/borrows', verifyToken, async (req, res) => {
  try {
    const filter = {
      email: req.user.email,
    };
    const borrows = await borrowsCollection
      .find(filter)
      .sort({ borrowDate: -1 })
      .toArray();
    res.send(borrows);
  } catch (error) {
    res.status(500).send({ message: 'Failed to get borrows', error: error.message });
  }
});

app.delete('/borrows/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: 'Invalid borrow id' });
    }
    const borrow = await borrowsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!borrow) {
      return res.status(404).send({ message: 'Borrow record not found' });
    }

    if (borrow.email !== req.user.email) {
      return res.status(403).send({
        message: 'You are not allowed to return this book',
      });
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

// Start server only in local development
if (!process.env.VERCEL) {
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
}

export default app;

