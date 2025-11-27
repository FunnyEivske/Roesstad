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

    // Clear children list
    const childrenList = document.getElementById('children-list');
    if (childrenList) childrenList.innerHTML = '<li style="opacity: 0.6; font-size: 0.9rem;">Ingen registrerte barn</li>';

    populateDropdowns(); // Populate relationships
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

function populateDropdowns(excludeId = null) {
    const motherSelect = document.getElementById('motherId');
    const fatherSelect = document.getElementById('fatherId');
    const spouseSelect = document.getElementById('spouseId');

    // Clear existing options
    [motherSelect, fatherSelect, spouseSelect].forEach(select => {
        if (select) select.innerHTML = '<option value="">Ingen valgt</option>';
    });

    familyData.forEach(member => {
        if (member.id === excludeId) return; // Don't link to self

        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = `${member.firstName} ${member.lastName}`;

        // Add to appropriate dropdowns based on gender/logic
        // Spouse can be anyone for now
        if (spouseSelect) spouseSelect.appendChild(option.cloneNode(true));

        if (member.gender === 'female') {
            if (motherSelect) motherSelect.appendChild(option.cloneNode(true));
        } else if (member.gender === 'male') {
            if (fatherSelect) fatherSelect.appendChild(option.cloneNode(true));
        } else {
            // If gender undefined, maybe add to both or neither? 
            // For now, let's add to both to be safe if data is missing
            if (motherSelect) motherSelect.appendChild(option.cloneNode(true));
            if (fatherSelect) fatherSelect.appendChild(option.cloneNode(true));
        }
    });
}

memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('member-id').value;

    // Get gender value
    const genderInputs = document.getElementsByName('gender');
    let gender = null;
    for (const input of genderInputs) {
        if (input.checked) {
            gender = input.value;
            break;
        }
    }

    const memberData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        gender: gender,
        birthDate: document.getElementById('birthDate').value,
        deathDate: document.getElementById('deathDate').value || null,
        location: document.getElementById('location').value,
        notes: document.getElementById('notes').value,

        // Relationships
        motherId: document.getElementById('motherId').value || null,
        fatherId: document.getElementById('fatherId').value || null,
        spouseId: document.getElementById('spouseId').value || null
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
    container.innerHTML = '';

    if (familyData.length === 0) return;

    // 1. Calculate Generations
    const memberMap = new Map(familyData.map(m => [m.id, m]));
    const generations = {};
    const processed = new Set();

    function getGeneration(id, depth = 0) {
        if (depth > 20) return 0; // Prevent infinite recursion
        const member = memberMap.get(id);
        if (!member) return 0;

        let parentGen = -1;
        if (member.motherId) parentGen = Math.max(parentGen, getGeneration(member.motherId, depth + 1));
        if (member.fatherId) parentGen = Math.max(parentGen, getGeneration(member.fatherId, depth + 1));

        return parentGen + 1;
    }

    familyData.forEach(member => {
        const gen = getGeneration(member.id);
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(member);
    });

    // 2. Position Members
    const cardWidth = 220;
    const cardHeight = 100; // Approx
    const gapX = 40;
    const gapY = 150;
    const startY = 50;

    // Sort generations to ensure we process 0, 1, 2...
    const genKeys = Object.keys(generations).sort((a, b) => a - b);

    // Store positions for line drawing
    const positions = {}; // id -> {x, y, width, height}

    genKeys.forEach(genKey => {
        const members = generations[genKey];
        // Sort members to try and keep spouses together (simple heuristic)
        members.sort((a, b) => {
            if (a.spouseId === b.id) return -1;
            return 0;
        });

        // Center the row relative to the container
        // We'll use a fixed large width for the container to allow scrolling
        // Let's assume center is 1000px
        const rowWidth = members.length * (cardWidth + gapX) - gapX;
        let startX = Math.max(50, 1000 - rowWidth / 2);

        members.forEach((member, index) => {
            const x = startX + (index * (cardWidth + gapX));
            const y = startY + (genKey * gapY);

            positions[member.id] = { x, y, width: cardWidth, height: cardHeight };

            const card = document.createElement('div');
            card.className = 'family-card';
            card.style.left = `${x}px`;
            card.style.top = `${y}px`;

            const genderIcon = member.gender === 'male' ? '👨' : (member.gender === 'female' ? '👩' : '👤');

            card.innerHTML = `
                <div class="card-avatar">${genderIcon}</div>
                <div class="card-name">${member.firstName} ${member.lastName}</div>
                <div class="card-dates">
                    ${new Date(member.birthDate).getFullYear()} - ${member.deathDate ? new Date(member.deathDate).getFullYear() : ''}
                </div>
            `;

            card.addEventListener('click', () => openEditModal(member));
            container.appendChild(card);
        });
    });

    // 3. Draw Lines
    drawLines(positions);
}

function drawLines(positions) {
    const svg = document.getElementById('relationship-lines');
    svg.innerHTML = '';

    // Set SVG size to match content
    const maxX = Math.max(...Object.values(positions).map(p => p.x + p.width)) + 100;
    const maxY = Math.max(...Object.values(positions).map(p => p.y + p.height)) + 100;

    svg.setAttribute('width', Math.max(2000, maxX)); // Min width 2000 for scrolling
    svg.setAttribute('height', Math.max(1000, maxY));

    familyData.forEach(member => {
        const pos = positions[member.id];
        if (!pos) return;

        // Parent Connections
        [member.motherId, member.fatherId].forEach(parentId => {
            if (parentId && positions[parentId]) {
                const parentPos = positions[parentId];

                // Draw line from bottom of parent to top of child
                const x1 = parentPos.x + parentPos.width / 2;
                const parentBottom = parentPos.y + 120; // Approx bottom of card

                const x2 = pos.x + pos.width / 2;
                const y2 = pos.y;

                // Bezier curve
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                const d = `M ${x1} ${parentBottom} C ${x1} ${parentBottom + 50}, ${x2} ${y2 - 50}, ${x2} ${y2}`;

                path.setAttribute("d", d);
                path.setAttribute("stroke", "#88a090"); // Moss color
                path.setAttribute("stroke-width", "2");
                path.setAttribute("fill", "none");
                svg.appendChild(path);
            }
        });

        // Spouse Connection
        if (member.spouseId && positions[member.spouseId]) {
            const spousePos = positions[member.spouseId];
            // Only draw once (e.g., if id < spouseId)
            if (member.id < member.spouseId) {
                const x1 = pos.x + pos.width;
                const y1 = pos.y + 60; // Middle of card approx
                const x2 = spousePos.x;
                const y2 = spousePos.y + 60;

                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                const d = `M ${x1} ${y1} L ${x2} ${y2}`;

                path.setAttribute("d", d);
                path.setAttribute("stroke", "#1a472a"); // Forest color
                path.setAttribute("stroke-width", "2");
                path.setAttribute("stroke-dasharray", "5,5"); // Dashed for spouse
                path.setAttribute("fill", "none");
                svg.appendChild(path);
            }
        }
    });
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

    // Set Gender
    const genderInputs = document.getElementsByName('gender');
    for (const input of genderInputs) {
        if (input.value === member.gender) {
            input.checked = true;
        }
    }

    // Populate dropdowns first (excluding self)
    populateDropdowns(member.id);

    // Set Relationships
    document.getElementById('motherId').value = member.motherId || '';
    document.getElementById('fatherId').value = member.fatherId || '';
    document.getElementById('spouseId').value = member.spouseId || '';

    // List Children
    const childrenList = document.getElementById('children-list');
    if (childrenList) {
        childrenList.innerHTML = '';
        const children = familyData.filter(m => m.motherId === member.id || m.fatherId === member.id);

        if (children.length === 0) {
            childrenList.innerHTML = '<li style="opacity: 0.6; font-size: 0.9rem;">Ingen registrerte barn</li>';
        } else {
            children.forEach(child => {
                const li = document.createElement('li');
                li.textContent = `${child.firstName} ${child.lastName}`;
                li.style.padding = '4px 0';
                li.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
                childrenList.appendChild(li);
            });
        }
    }

    // Add Child Button Handler
    const addChildBtn = document.getElementById('addChildBtn');
    if (addChildBtn) {
        addChildBtn.onclick = () => {
            // Close current modal
            memberModal.style.display = 'none';

            // Open new modal for child
            setTimeout(() => {
                document.getElementById('modal-title').textContent = "Legg til barn";
                memberForm.reset();
                document.getElementById('member-id').value = '';
                populateDropdowns();

                // Pre-select parent based on gender
                if (member.gender === 'female') {
                    document.getElementById('motherId').value = member.id;
                } else if (member.gender === 'male') {
                    document.getElementById('fatherId').value = member.id;
                }

                // Pre-fill last name
                document.getElementById('lastName').value = member.lastName;

                memberModal.style.display = 'flex';
            }, 100);
        };
    }

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
            const marker = new google.maps.Marker({
                position: { lat: member.lat, lng: member.lng },
                map: map,
                title: `${member.firstName} ${member.lastName}`
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="color: black; padding: 5px;">
                        <strong>${member.firstName} ${member.lastName}</strong><br>
                        ${member.location}<br>
                        <small>${new Date(member.birthDate).getFullYear()}</small>
                    </div>
                `
            });

            marker.addListener('click', () => {
                infoWindow.open(map, marker);
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
