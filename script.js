
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
// Global Tree State for Pan/Zoom
let treeState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0
};

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

// Geocoding
document.getElementById('geocodeBtn').addEventListener('click', () => {
    const location = document.getElementById('location').value;
    if (!location) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ 'address': location }, (results, status) => {
        if (status === 'OK') {
            const lat = results[0].geometry.location.lat();
            const lng = results[0].geometry.location.lng();

            document.getElementById('lat').value = lat.toFixed(6);
            document.getElementById('lng').value = lng.toFixed(6);
        } else {
            alert('Kunne ikke finne koordinater for dette stedet: ' + status);
        }
    });
});

// --- Data Handling ---

function loadFamilyData() {
    console.log("Loading family data...");
    db.collection('familyMembers').onSnapshot(snapshot => {
        console.log("Snapshot received. Docs:", snapshot.size);
        familyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateDropdowns();

        // Refresh active view
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'tree-tab') renderTree();
        if (activeTab && activeTab.id === 'history-tab') renderHistory();
        if (activeTab && activeTab.id === 'map-tab') initMap();
    }, error => {
        console.error("Firestore Error:", error);
        const container = document.getElementById('family-cards-container');
        if (container) {
            container.innerHTML = `<div style="text-align: center; color: red; margin-top: 50px;">
                Kunne ikke hente data: ${error.message}<br>
                Sjekk konsollen for detaljer.
            </div>`;
        }
    });
}

function populateDropdowns(excludeId = null) {
    const selects = ['motherId', 'fatherId', 'spouseId'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="">Ingen valgt</option>';

        const sorted = [...familyData].sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));

        sorted.forEach(m => {
            if (m.id === excludeId) return;
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = `${m.firstName} ${m.lastName} (${new Date(m.birthDate).getFullYear()})`;
            select.appendChild(option);
        });
    });
}

// Add/Edit Member
memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('member-id').value;

    const data = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        gender: document.querySelector('input[name="gender"]:checked').value,
        birthDate: document.getElementById('birthDate').value,
        deathDate: document.getElementById('deathDate').value,
        location: document.getElementById('location').value,
        lat: parseFloat(document.getElementById('lat').value) || null,
        lng: parseFloat(document.getElementById('lng').value) || null,
        motherId: document.getElementById('motherId').value || null,
        fatherId: document.getElementById('fatherId').value || null,
        spouseId: document.getElementById('spouseId').value || null,
        notes: document.getElementById('notes').value
    };

    if (id) {
        db.collection('familyMembers').doc(id).update(data)
            .then(() => {
                memberModal.style.display = 'none';
                memberForm.reset();
            });
    } else {
        db.collection('familyMembers').add(data)
            .then(() => {
                memberModal.style.display = 'none';
                memberForm.reset();
            });
    }
});

// Modal Actions
addMemberBtn.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = "Legg til familiemedlem";
    memberForm.reset();
    document.getElementById('member-id').value = '';
    populateDropdowns();
    memberModal.style.display = 'flex';
});

closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        memberModal.style.display = 'none';
        loginModal.style.display = 'none';
    });
});

window.onclick = (e) => {
    if (e.target === memberModal) memberModal.style.display = 'none';
    if (e.target === loginModal) loginModal.style.display = 'none';
};

const deleteBtn = document.getElementById('deleteBtn');
if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
        const id = document.getElementById('member-id').value;
        if (!id) return;
        if (confirm('Er du sikker på at du vil slette denne personen?')) {
            db.collection('familyMembers').doc(id).delete()
                .then(() => {
                    memberModal.style.display = 'none';
                });
        }
    });
}

// --- Feature: Family Tree (Static Layout) ---

// Feature: Family Tree (Static Layout) ---

function updateTransform() {
    const treeContainer = document.getElementById('tree-container');
    if (treeContainer) {
        // Safety check for NaN
        if (isNaN(treeState.pointX)) treeState.pointX = 0;
        if (isNaN(treeState.pointY)) treeState.pointY = 0;
        if (isNaN(treeState.scale)) treeState.scale = 1;

        treeContainer.style.transform = `translate(${treeState.pointX}px, ${treeState.pointY}px) scale(${treeState.scale})`;
        console.log(`Transform updated: X=${treeState.pointX}, Y=${treeState.pointY}, Scale=${treeState.scale}`);
    }
}

function renderTree() {
    const container = document.getElementById('family-cards-container');
    const treeTab = document.getElementById('tree-tab');

    // Disable Native Scrolling, Enable Custom
    if (treeTab) {
        // Handled by CSS (overflow: hidden), but force styles if needed
        treeTab.style.overflow = 'hidden';
        treeTab.style.cursor = 'grab';
    }

    if (!container) return;
    container.innerHTML = '';

    const svg = document.getElementById('relationship-lines');
    if (svg) svg.innerHTML = '';

    if (!familyData || familyData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #88a090; margin-top: 50px;">Ingen familiemedlemmer funnet. Klikk på + for å legge til.</div>';
        return;
    }

    try {
        const memberMap = new Map(familyData.map(m => [m.id, { ...m }]));
        const childrenMap = new Map();
        const partnerAdjacency = new Map();

        const addRelation = (id1, id2, type) => {
            if (!id1 || !id2) return;
            if (!partnerAdjacency.has(id1)) partnerAdjacency.set(id1, []);
            if (!partnerAdjacency.has(id2)) partnerAdjacency.set(id2, []);

            if (!partnerAdjacency.get(id1).find(r => r.id === id2)) {
                partnerAdjacency.get(id1).push({ id: id2, type });
            }
            if (!partnerAdjacency.get(id2).find(r => r.id === id1)) {
                partnerAdjacency.get(id2).push({ id: id1, type });
            }
        };

        familyData.forEach(m => {
            if (m.spouseId) addRelation(m.id, m.spouseId, 'spouse');
            if (m.motherId && m.fatherId) {
                // Parents match -> they are partners
                addRelation(m.motherId, m.fatherId, 'coparent');
                [m.motherId, m.fatherId].forEach(pId => {
                    if (!childrenMap.has(pId)) childrenMap.set(pId, []);
                    childrenMap.get(pId).push(m.id);
                });
            } else {
                // Single parent or partial
                [m.motherId, m.fatherId].forEach(pId => {
                    if (pId && memberMap.has(pId)) {
                        if (!childrenMap.has(pId)) childrenMap.set(pId, []);
                        childrenMap.get(pId).push(m.id);
                    }
                });
            }
        });

        const renderedSet = new Set();
        const placedNodes = [];

        const CARD_WIDTH = 220;
        const GAP_X = 50;
        const UNIT_GAP = 100;
        const GAP_Y = 250;

        const createCard = (member, x, y) => {
            if (!member) return;
            if (renderedSet.has(member.id)) return;

            const card = document.createElement('div');
            card.id = `card-${member.id}`;
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
            container.appendChild(card);
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Stop pan
                openEditModal(member);
            });
            // Prevent drag start on card text/images
            card.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });


            placedNodes.push({ ...member, x, y, width: CARD_WIDTH, height: 100 });
            renderedSet.add(member.id);
        };

        const renderComponent = (rootId, startY) => {
            const component = new Set();
            const queue = [rootId];
            component.add(rootId);

            while (queue.length > 0) {
                const curr = queue.shift();
                const partners = partnerAdjacency.get(curr) || [];
                partners.forEach(p => {
                    if (!component.has(p.id)) {
                        component.add(p.id);
                        queue.push(p.id);
                    }
                });
            }

            const members = Array.from(component);
            let sortedIds = [];

            const pivot = members.find(mId => {
                const adj = partnerAdjacency.get(mId) || [];
                const hasSpouse = adj.some(a => a.type === 'spouse');
                const hasEx = adj.some(a => a.type === 'coparent');
                return hasSpouse && hasEx;
            });

            if (pivot) {
                const adj = partnerAdjacency.get(pivot) || [];
                const exes = adj.filter(a => a.type === 'coparent').map(a => a.id);
                const spouses = adj.filter(a => a.type === 'spouse').map(a => a.id);
                sortedIds = [...new Set([...exes, pivot, ...spouses])];
            } else {
                sortedIds = members.sort((a, b) => {
                    const ma = memberMap.get(a);
                    const mb = memberMap.get(b);
                    return new Date(ma.birthDate) - new Date(mb.birthDate);
                });
            }

            const gapWidths = [];
            for (let i = 0; i < sortedIds.length - 1; i++) {
                const p1 = sortedIds[i];
                const p2 = sortedIds[i + 1];

                const c1 = childrenMap.get(p1) || [];
                const c2 = childrenMap.get(p2) || [];
                const common = c1.filter(id => c2.includes(id));

                let childrenBlockWidth = common.length * (CARD_WIDTH + GAP_X) - GAP_X;
                let gap = UNIT_GAP;
                if (childrenBlockWidth > CARD_WIDTH) {
                    gap = Math.max(UNIT_GAP, childrenBlockWidth - CARD_WIDTH * 2 + 100);
                }
                gapWidths.push(gap);
            }

            // Initially layout from 0
            let currentX = 0;

            sortedIds.forEach((id, index) => {
                const member = memberMap.get(id);
                createCard(member, currentX, startY);

                if (index < sortedIds.length - 1) {
                    const nextId = sortedIds[index + 1];
                    const gap = gapWidths[index];

                    const c1 = childrenMap.get(id) || [];
                    const c2 = childrenMap.get(nextId) || [];
                    const common = c1.filter(kid => c2.includes(kid));

                    if (common.length > 0) {
                        common.sort((a, b) => {
                            const ma = memberMap.get(a);
                            const mb = memberMap.get(b);
                            return new Date(ma.birthDate) - new Date(mb.birthDate);
                        });

                        const gapCenterX = currentX + CARD_WIDTH + gap / 2;
                        let totalChildrenWidth = common.length * CARD_WIDTH + (common.length - 1) * GAP_X;
                        let childStartX = gapCenterX - totalChildrenWidth / 2;

                        common.forEach(childId => {
                            createCard(memberMap.get(childId), childStartX, startY + GAP_Y);
                            childStartX += CARD_WIDTH + GAP_X;
                        });
                    }
                    currentX += CARD_WIDTH + gap;
                }

                // --- Single / Orphaned Children ---
                const myChildren = childrenMap.get(id) || [];
                const unrenderedChildren = myChildren.filter(kidId => !renderedSet.has(kidId));

                if (unrenderedChildren.length > 0) {
                    unrenderedChildren.sort((a, b) => new Date(memberMap.get(a).birthDate) - new Date(memberMap.get(b).birthDate));

                    let childX = currentX - ((unrenderedChildren.length * CARD_WIDTH) / 2);
                    if (index > 0) childX = Math.max(childX, currentX);

                    unrenderedChildren.forEach(kidId => {
                        createCard(memberMap.get(kidId), childX, startY + GAP_Y);
                        childX += CARD_WIDTH + GAP_X;
                    });
                }
            });
            return currentX;
        };

        const sortedMembers = Array.from(memberMap.values()).sort((a, b) => new Date(a.birthDate) - new Date(b.birthDate));

        let rootY = 100;

        sortedMembers.forEach(m => {
            if (!renderedSet.has(m.id)) {
                const isChild = (m.motherId && memberMap.has(m.motherId)) || (m.fatherId && memberMap.has(m.fatherId));
                if (!isChild) {
                    renderComponent(m.id, rootY);
                }
            }
        });

        // 3. Infinite Canvas: Remove fixed limits
        // We do simple auto-center ONCE on load, but no forced container clipping
        if (placedNodes.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            placedNodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.x + n.width > maxX) maxX = n.x + n.width;
                if (n.y < minY) minY = n.y;
                if (n.y + n.height > maxY) maxY = n.y + n.height;
            });

            // Center Viewport
            const treeWidth = maxX - minX;
            const treeHeight = maxY - minY;
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            treeState.pointX = (screenW - treeWidth) / 2 - minX;
            treeState.pointY = (screenH - treeHeight) / 2 - minY;
            treeState.pointY = Math.max(50, treeState.pointY); // Top padding

            // Ensure not NaN
            if (isNaN(treeState.pointX)) treeState.pointX = 0;
            if (isNaN(treeState.pointY)) treeState.pointY = 0;

            console.log("Calculated Initial Center:", treeState);
            updateTransform();
        }

        // Draw Lines
        const edges = [];
        const nodeLookup = new Map(placedNodes.map(n => [n.id, n]));

        placedNodes.forEach(node => {
            const partners = partnerAdjacency.get(node.id) || [];
            partners.forEach(rel => {
                if (node.id < rel.id && nodeLookup.has(rel.id)) {
                    edges.push({ source: node, target: nodeLookup.get(rel.id), type: rel.type });
                }
            });
        });

        drawStaticLines(placedNodes, edges);

    } catch (err) {
        console.error("Render Error:", err);
        container.innerHTML = `<div style="color: red; padding: 20px;">En feil oppstod under visning av treet:<br>${err.message}</div>`;
    }
}

function drawStaticLines(nodes, edges) {
    const svg = document.getElementById('relationship-lines');
    if (!svg) return;

    let minX = Infinity, maxX = -Infinity, maxY = 0;
    nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x + n.width > maxX) maxX = n.x + n.width;
        if (n.y + n.height > maxY) maxY = n.y + n.height;
    });

    // SVG needs to be big enough to cover everything
    // We can make it huge for infinite canvas feel
    svg.setAttribute('width', Math.max(5000, maxX + 1000));
    svg.setAttribute('height', Math.max(5000, maxY + 1000));

    let html = '';
    const nodeLookup = new Map(nodes.map(n => [n.id, n]));

    // 1. Draw Partner Lines
    edges.forEach(edge => {
        if (edge.type === 'spouse' || edge.type === 'coparent') {
            const s = edge.source;
            const t = edge.target;
            const x1 = s.x + s.width / 2;
            const y1 = s.y + 50;
            const x2 = t.x + t.width / 2;
            const y2 = t.y + 50;

            const strokeDash = edge.type === 'coparent' ? 'stroke-dasharray="5,5"' : '';
            html += `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#88a090" stroke-width="2" ${strokeDash} fill="none" />`;
        }
    });

    // 2. Draw Parent-Child Lines (Bracket Style)
    const groups = new Map();

    nodes.forEach(node => {
        if (node.motherId || node.fatherId) {
            const parents = [node.motherId, node.fatherId].filter(x => x).sort().join('|');
            if (parents) {
                if (!groups.has(parents)) groups.set(parents, []);
                groups.get(parents).push(node);
            }
        }
    });

    groups.forEach((children, key) => {
        const [p1Id, p2Id] = key.split('|');
        const p1 = nodeLookup.get(p1Id);
        const p2 = nodeLookup.get(p2Id);

        let startX, startY;

        if (p1 && p2) {
            startX = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;
            startY = p1.y + 50;
        } else if (p1) {
            startX = p1.x + p1.width / 2;
            startY = p1.y + 100;
        } else if (p2) {
            startX = p2.x + p2.width / 2;
            startY = p2.y + 100;
        } else {
            return;
        }

        const dropHeight = 80;
        const bracketY = startY + dropHeight;

        html += `<path d="M ${startX} ${startY} L ${startX} ${bracketY}" stroke="#88a090" stroke-width="2" fill="none" />`;

        let minChildX = Infinity;
        let maxChildX = -Infinity;
        const childTopY = children[0].y;

        children.forEach(child => {
            const cx = child.x + child.width / 2;
            if (cx < minChildX) minChildX = cx;
            if (cx > maxChildX) maxChildX = cx;

            html += `<path d="M ${cx} ${childTopY} L ${cx} ${bracketY}" stroke="#88a090" stroke-width="2" fill="none" />`;
        });

        if (children.length > 1) {
            html += `<path d="M ${minChildX} ${bracketY} L ${maxChildX} ${bracketY}" stroke="#88a090" stroke-width="2" fill="none" />`;
        } else {
            const childX = children[0].x + children[0].width / 2;
            if (Math.abs(startX - childX) > 1) {
                html += `<path d="M ${Math.min(startX, childX)} ${bracketY} L ${Math.max(startX, childX)} ${bracketY}" stroke="#88a090" stroke-width="2" fill="none" />`;
            }
        }
    });

    svg.innerHTML = html;
}

// --- Feature: Family Tree Navigation (Pan/Zoom) ---

function setupPanZoom() {
    const treeTab = document.getElementById('tree-tab');
    const treeContainer = document.getElementById('tree-container');

    if (!treeTab || !treeContainer) {
        console.error("SetupPanZoom: Elements not found");
        return;
    }

    console.log("SetupPanZoom: Initializing...");

    // Force styles
    treeTab.style.overflow = 'hidden';
    treeTab.style.cursor = 'grab';
    treeTab.style.width = '100%';
    treeTab.style.height = '100%';
    treeTab.style.userSelect = 'none'; // Improve drag feel
    treeContainer.style.transformOrigin = '0 0';

    // Zoom (Wheel)
    treeTab.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Safety against NaN
        if (isNaN(treeState.scale)) treeState.scale = 1;
        if (isNaN(treeState.pointX)) treeState.pointX = 0;
        if (isNaN(treeState.pointY)) treeState.pointY = 0;

        if (e.ctrlKey) {
            const xs = (e.clientX - treeState.pointX) / treeState.scale;
            const ys = (e.clientY - treeState.pointY) / treeState.scale;
            const delta = -e.deltaY;
            (delta > 0) ? (treeState.scale *= 1.1) : (treeState.scale /= 1.1);
            treeState.scale = Math.min(Math.max(0.1, treeState.scale), 5);
            treeState.pointX = e.clientX - xs * treeState.scale;
            treeState.pointY = e.clientY - ys * treeState.scale;
        } else {
            // Scroll Pan
            treeState.pointX -= e.deltaX;
            treeState.pointY -= e.deltaY;
        }
        updateTransform();
    });

    // Pan (Mouse)
    treeTab.addEventListener('mousedown', (e) => {
        // Allow clicks on buttons/inputs
        if (e.target.closest('button') || e.target.closest('input')) return;

        // Stop if clicking a card (handled in card click)
        if (e.target.closest('.family-card')) return;

        console.log("MouseDown on treeTab");
        e.preventDefault();

        treeState.startX = e.clientX - treeState.pointX;
        treeState.startY = e.clientY - treeState.pointY;
        treeState.panning = true;
        treeTab.style.cursor = 'grabbing';
    });

    // Attach to WINDOW/DOCUMENT to handle drags that go outside the element
    window.addEventListener('mousemove', (e) => {
        if (!treeState.panning) return;
        e.preventDefault();
        treeState.pointX = e.clientX - treeState.startX;
        treeState.pointY = e.clientY - treeState.startY;
        updateTransform();
    });

    const stopPan = () => {
        if (treeState.panning) {
            console.log("MouseUp: Stopping pan");
            treeState.panning = false;
            treeTab.style.cursor = 'grab';
        }
    };

    window.addEventListener('mouseup', stopPan);
    // Also stop on mouseleave if desired, but window mouseup usually catches it
    treeTab.addEventListener('mouseleave', stopPan);

    // Global click logger REMOVED
}

// Initialize PanZoom when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupPanZoom();
});

// Tabs
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        if (tabId === 'tree-tab') {
            renderTree();
        } else if (tabId === 'map-tab') {
            if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
                initMap();
            } else {
                console.warn("Google Maps API not loaded. Map will not render.");
            }
        } else if (tabId === 'history-tab') {
            renderHistory();
        }
    });
});
