import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Håndter klikk
document.getElementById('btn-login').addEventListener('click', async () => {
    const btn = document.getElementById('btn-login');
    const msg = document.getElementById('error-msg');
    
    btn.textContent = "Autentiserer...";
    msg.textContent = "";
    
    try {
        await signInAnonymously(auth);
        
        // Suksess -> Gå til hovedsiden (Røsstad.html)
        window.location.href = "Røsstad.html";
        
    } catch (error) {
        console.error(error);
        msg.textContent = "Feil: " + error.message;
        btn.textContent = "Prøv igjen";
    }
});
