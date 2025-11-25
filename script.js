// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyD-E58BdRwFCHDmsgRG9-PEWzMaQoheJ-0",
    authDomain: "roesstad-9fd48.firebaseapp.com",
    projectId: "roesstad-9fd48",
    storageBucket: "roesstad-9fd48.firebasestorage.app",
    messagingSenderId: "704119736902",
    appId: "1:704119736902:web:bc47f2b6a1383de0479847"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logoutBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const memberModal = document.getElementById('member-modal');
const addMemberBtn = document.getElementById('addMemberBtn');
const closeModalBtns = document.querySelectorAll('.close-modal');
const memberForm = document.getElementById('member-form');

// State
let currentUser = null;
let familyData = [];

// --- Authentication ---

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loginModal.style.display = 'none';
        logoutBtn.style.display = 'block';
        loadFamilyData();
    } else {
        currentUser = null;
        loginModal.style.display = 'flex';
        logoutBtn.style.display = 'none';
    }
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            loginError.textContent = "Feil e-post eller passord.";
            console.error(error);
        });
});

logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// --- UI Logic ---

// Dark Mode
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    darkModeToggle.textContent = isDark ? '🌙' : '☀️';
});

// Tabs
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active to clicked
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Modals
addMemberBtn.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = "Legg til person";
    memberForm.reset();
    document.getElementById('member-id').value = '';
    memberModal.style.display = 'flex';
});

closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target === memberModal) {
        memberModal.style.display = 'none';
    }
});

// --- Data Handling ---

function loadFamilyData() {
    console.log("Loading family data...");
    db.collection('familyMembers').onSnapshot(snapshot => {
        familyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTree();
        renderHistory();
        initMap(); // Re-init map markers
    }, error => {
        console.error("Error loading data:", error);
    });
}

memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('member-id').value;

    const memberData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        birthDate: document.getElementById('birthDate').value,
        deathDate: document.getElementById('deathDate').value || null,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value,
        // TODO: Handle lat/lng via Geocoding API or manual input later
        // TODO: Handle relationships
    };

    if (id) {
        db.collection('familyMembers').doc(id).update(memberData)
            .then(() => memberModal.style.display = 'none');
    } else {
        db.collection('familyMembers').add(memberData)
            .then(() => memberModal.style.display = 'none');
    }
});

// --- Feature: Family Tree ---

function renderTree() {
    const container = document.getElementById('family-cards-container');
    container.innerHTML = ''; // Clear current

    // Simple grid layout for now (placeholder for complex tree algo)
    // In a real tree, we'd calculate positions based on generations

    familyData.forEach((member, index) => {
        const card = document.createElement('div');
        card.className = 'family-card';
        // Simple positioning for demo purposes
        card.style.top = `${100 + (Math.floor(index / 5) * 150)}px`;
        card.style.left = `${50 + ((index % 5) * 250)}px`;

        card.innerHTML = `
            <div class="card-name">${member.firstName} ${member.lastName}</div>
            <div class="card-dates">
                ${new Date(member.birthDate).getFullYear()} - ${member.deathDate ? new Date(member.deathDate).getFullYear() : ''}
            </div>
        `;

        card.addEventListener('click', () => openEditModal(member));
        container.appendChild(card);
    });

    drawLines();
}

function drawLines() {
    // Placeholder for SVG line drawing logic
    const svg = document.getElementById('relationship-lines');
    svg.innerHTML = '';
    // Logic to draw lines between parent/child/spouse would go here
}

function openEditModal(member) {
    document.getElementById('modal-title').textContent = "Rediger person";
    document.getElementById('member-id').value = member.id;
    document.getElementById('firstName').value = member.firstName;
    document.getElementById('lastName').value = member.lastName;
    document.getElementById('birthDate').value = member.birthDate;
    document.getElementById('deathDate').value = member.deathDate || '';
    document.getElementById('location').value = member.location || '';
    document.getElementById('notes').value = member.notes || '';
    memberModal.style.display = 'flex';
}

// --- Feature: Map ---

// Global function for Google Maps callback
window.initMap = function () {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Default to Høvåg/Røsstad area
    const center = { lat: 58.16, lng: 8.25 };

    const map = new google.maps.Map(mapElement, {
        zoom: 10,
        center: center,
        styles: [ /* Optional: Add custom map styles for dark mode here */]
    });

    // Add markers for family members
    familyData.forEach(member => {
        if (member.lat && member.lng) {
            new google.maps.Marker({
                position: { lat: member.lat, lng: member.lng },
                map: map,
                title: `${member.firstName} ${member.lastName}`
            });
        }
    });
}

// --- Feature: History ---

function renderHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    // Sort by birthdate (Oldest first)
    const sortedMembers = [...familyData].sort((a, b) => {
        return new Date(a.birthDate) - new Date(b.birthDate);
    });

    sortedMembers.forEach(member => {
        const item = document.createElement('li');
        item.className = 'history-item';
        const year = new Date(member.birthDate).getFullYear();
        item.innerHTML = `
            <span class="history-year">${year}</span> - 
            <strong>${member.firstName} ${member.lastName}</strong> ble født.
        `;
        list.appendChild(item);
    });
}
