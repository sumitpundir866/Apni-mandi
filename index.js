import express from 'express';
import ejs from 'ejs';
import bodyParser from 'body-parser';
import pg from 'pg';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 3000;

const db = new pg.Client({
  user: 'postgres',
  host: 'localhost',
  database: 'farm-to-retail',
  password: 'nitin123',
  port: 5432,
});
db.connect();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Store uploaded images in 'public/uploads'
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Rename file with timestamp
    }
});

const upload = multer({ storage: storage });


const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Set up session
app.use(session({
  secret: 'your_secret_key', 
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// ----------------- ROUTES -----------------

app.get('/', (req, res) => {
    res.render('open.ejs');
});

app.get('/loginfarmer', (req, res) => {
    res.render('loginfarmer.ejs');
});

app.get('/loginbuyer', (req, res) => {
    res.render('loginbuyer.ejs');
});

app.get('/registerfarmer', (req, res) => {
    res.render('registerfarmer.ejs');
});

app.get('/registerbuyer', (req, res) => {
    res.render('registerbuyer.ejs');
});

app.get('/homefarmer', (req, res) => {
    if (!req.session.user) return res.redirect('/loginfarmer');
    res.render('homefarmer.ejs', { user: req.session.user });
});

app.get('/homeretail', (req, res) => {
    if (!req.session.user) return res.redirect('/loginbuyer');
    res.render('homeretail.ejs', { user: req.session.user });
});

app.get('/placeorder', (req, res) => {
    res.render('placeorder.ejs');
});

app.get('/yourorders', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/loginfarmer');
    }

    try {
        const userOrders = await db.query(
            'SELECT * FROM product WHERE email = $1', 
            [req.session.user.email]
        );

        res.render('yourorders.ejs', { 
            orders: userOrders.rows, 
            user: req.session.user 
        });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});


// ----------------- REGISTER ROUTE -----------------
app.post('/register', async (req, res) => {
    const { fullname, email, phone_no, aadhar_no, password } = req.body;

    try {
        const result = await db.query(
            'INSERT INTO farmer (name, email, phone, adhar, password) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [fullname, email, phone_no, aadhar_no, password]
        );
        const user = result.rows[0];
        req.session.user = {
            fullname: user.name,
            email: user.email,
            phone : user.phone,
            aadhar : user.adhar
        };

        res.redirect('/homefarmer');
    } catch (error) {
        console.error('Error inserting data into farmer:', error);
        res.redirect('/registerfarmer?error=true');
    }
}); 

app.post('/registerbuyer', async (req, res) => {
    const { fullname, email, phone_no, aadhar_no, password } = req.body;

    try {
        const result = await db.query(
            'INSERT INTO buyer (name, email, phone, adhar, password) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [fullname, email, phone_no, aadhar_no, password]
        );
        const user = result.rows[0];
        req.session.user = {
            fullname: user.name,
            email: user.email,
            phone : user.phone,
            aadhar : user.adhar
        };

        res.redirect('/homeretail');
    } catch (error) {
        console.error('Error inserting data into farmer:', error);
        res.redirect('/registerbuyer?error=true');
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await db.query('SELECT * FROM farmer WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.send('User not found');
        }

        const user = result.rows[0];

        if (user.password !== password) {
            return res.send('Incorrect password');
        }

        req.session.user = {
            fullname: user.name,
            email: user.email,
            phone : user.phone,
            aadhar : user.adhar
        };

        res.redirect('/homefarmer');
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});

app.post('/loginbuyer', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await db.query('SELECT * FROM buyer WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.send('User not found');
        }

        const user = result.rows[0];

        if (user.password !== password) {
            return res.send('Incorrect password');
        }

        req.session.user = {
            fullname: user.name,
            email: user.email,
            phone : user.phone,
            aadhar : user.adhar
        };

        res.redirect('/homeretail');
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});


app.post('/place', upload.single('image'), async (req, res) => {
    const { email, vegetableType, lots, description, price } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const result = await db.query(
            'INSERT INTO product (email, vegetable, lots, description, price, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [email, vegetableType, lots, description, price, image_url]
        );

        // Redirect user to "Your Orders" page
        res.redirect('/yourorders');
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});

app.post('/buy', async (req, res) => {
    const { vegetable, price, lots, seller_email } = req.body;
    const buyer_name = req.session.user.fullname; // Get buyer's name from session
    const buyer_email = req.session.user.email; // Get buyer's email from session

    try {
        // Insert buyer's order into the orders table
        await db.query(
            'INSERT INTO orders (name, email, vegetable, price, lots) VALUES ($1, $2, $3, $4, $5)',
            [buyer_name, buyer_email, vegetable, price, lots]
        );

        // Update the product table (reduce lots)
        await db.query(
            'UPDATE product SET lots = lots - $1 WHERE email = $2 AND vegetable = $3',
            [lots, seller_email, vegetable]
        );

        res.redirect('/orders');
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});


app.get('/orders', async (req, res) => {
    try {
        const buyer_email = req.session.user.email; // Get buyer's email from session
        const orders = await db.query(
            'SELECT * FROM orders WHERE email = $1',
            [buyer_email]
        );

        res.render('orders.ejs', { orders: orders.rows });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});


app.get('/profile', async (req, res) => {

    try {
        const userdata = await db.query('SELECT name, email, phone, adhar FROM farmer WHERE email = $1', [req.session.user.email]);
        if (userdata.rows.length === 0) return res.send('User not found');
        
        const user = userdata.rows[0];
        res.render('profile.ejs', { fullname: user.name, email: user.email, phone: user.phone, aadhar: user.adhar });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});

app.get('/profilebuyer', async (req, res) => {

    try {
        const userdata = await db.query('SELECT name, email, phone, adhar FROM buyer WHERE email = $1', [req.session.user.email]);
        if (userdata.rows.length === 0) return res.send('User not found');
        
        const user = userdata.rows[0];
        res.render('profilebuyer.ejs', { fullname: user.name, email: user.email, phone: user.phone, aadhar: user.adhar });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});

app.get('/vegetables', async (req, res) => {
    try {
        const products = await db.query(`
            SELECT p.email, p.vegetable, p.lots, p.description, p.price, p.image_url, f.name
            FROM product p
            JOIN farmer f ON p.email = f.email
        `);

        res.render('vegetables.ejs', { orders : products.rows });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).send("Server Error");
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ----------------- START SERVER -----------------
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
