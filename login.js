import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Håndter klikk
const loginBtn = document.getElementById('btn-login');
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const msg = document.getElementById('error-msg');
        
        loginBtn.textContent = "Autentiserer...";
        msg.textContent = "";
        
        try {
            await signInAnonymously(auth);
            // Suksess -> Gå til hovedsiden
            window.location.href = "Røsstad.html";
        } catch (error) {
            console.error(error);
            msg.textContent = "Feil: " + error.message;
            loginBtn.textContent = "Prøv igjen";
        }
    });
}
