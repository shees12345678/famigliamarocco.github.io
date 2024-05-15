const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'your_generated_secret_key',
    resave: false,
    saveUninitialized: true
}));

const USERS_JSON = path.join(__dirname, 'users.json');
const TASKS_JSON = path.join(__dirname, 'tasks.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_JSON, 'utf8'));
}

function getTasks() {
    if (fs.existsSync(TASKS_JSON)) {
        return JSON.parse(fs.readFileSync(TASKS_JSON, 'utf8'));
    } else {
        return [];
    }
}

function saveTasks(tasks) {
    fs.writeFileSync(TASKS_JSON, JSON.stringify(tasks, null, 2));
}

function checkAuth(req, res, next) {
    if (req.session.user_id) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.user_id = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        res.redirect('/');
    } else {
        res.sendFile(path.join(__dirname, 'views', 'login.html'));
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/user/:userId', checkAuth, (req, res) => {
    const users = getUsers();
    const user = users.find(u => u.id == req.params.userId);
    if (user) {
        res.sendFile(path.join(__dirname, 'views', 'user_area.html'));
    } else {
        res.status(404).send('Utente non trovato');
    }
});

app.post('/assegna_compito', checkAuth, upload.single('photo'), (req, res) => {
    if (req.session.role === 'master') {
        const { descrizione_compito, user_id, scadenza } = req.body;
        const tasks = getTasks();
        const taskId = tasks.length ? tasks[tasks.length - 1].id + 1 : 1;
        const currentDate = new Date().toISOString();
        const photo = req.file ? req.file.filename : null;
        tasks.push({ 
            id: taskId, 
            user_id: parseInt(user_id), 
            description: descrizione_compito, 
            completed: false,
            date_assigned: currentDate,
            date_completed: null,
            deadline: scadenza,
            photo: photo,
            completed_photo: null
        });
        saveTasks(tasks);
        res.redirect('/');
    } else {
        res.status(403).send('Accesso non autorizzato');
    }
});

app.post('/completa_compito', checkAuth, upload.single('photo'), (req, res) => {
    const { task_id } = req.body;
    const tasks = getTasks();
    const task = tasks.find(t => t.id == task_id);
    if (task && task.user_id == req.session.user_id) {
        task.completed = true;
        task.date_completed = new Date().toISOString();
        task.completed_photo = req.file ? req.file.filename : null;
        saveTasks(tasks);
        res.redirect('/');
    } else {
        res.status(403).send('Accesso non autorizzato o compito non trovato');
    }
});

app.post('/modifica_compito', checkAuth, upload.single('photo'), (req, res) => {
    if (req.session.role === 'master') {
        const { task_id, descrizione_compito, user_id, scadenza } = req.body;
        const tasks = getTasks();
        const task = tasks.find(t => t.id == task_id);
        if (task) {
            task.description = descrizione_compito;
            task.user_id = parseInt(user_id);
            task.deadline = scadenza;
            if (req.file) {
                task.photo = req.file.filename;
            }
            saveTasks(tasks);
            res.redirect('/');
        } else {
            res.status(404).send('Compito non trovato');
        }
    } else {
        res.status(403).send('Accesso non autorizzato');
    }
});

app.post('/cancella_compito', checkAuth, (req, res) => {
    if (req.session.role === 'master') {
        const { task_id } = req.body;
        let tasks = getTasks();
        tasks = tasks.filter(t => t.id != task_id);
        saveTasks(tasks);
        res.redirect('/');
    } else {
        res.status(403).send('Accesso non autorizzato');
    }
});

app.get('/dati/utenti', checkAuth, (req, res) => {
    const users = getUsers();
    res.json(users);
});

app.get('/dati/compiti', checkAuth, (req, res) => {
    const tasks = getTasks();
    const today = new Date().toISOString().split('T')[0];

    if (req.session.role === 'master') {
        const activeTasks = tasks.filter(task => task.deadline >= today);
        activeTasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)); // Ordinare per scadenza
        res.json(activeTasks);
    } else {
        const userTasks = tasks.filter(task => task.user_id === req.session.user_id);
        res.json(userTasks);
    }
});

app.get('/dati/utente_corrente', checkAuth, (req, res) => {
    if (req.session.user_id) {
        res.json({ id: req.session.user_id, username: req.session.username, role: req.session.role });
    } else {
        res.status(401).json({ error: 'Non autenticato' });
    }
});

app.listen(3000, () => {
    console.log('Server avviato su http://localhost:3000');
});
