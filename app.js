import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBw-u4Pzc8zqj4r_Drh6kAY8BIMFcr6gJ8",
    authDomain: "smarttask-fd2f4.firebaseapp.com",
    projectId: "smarttask-fd2f4",
    storageBucket: "smarttask-fd2f4.firebasestorage.app",
    messagingSenderId: "854448533703",
    appId: "1:854448533703:web:5f11346a36e96ae4f58ee2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentCategoryFilter = "All";
let currentSearchQuery = "";
let snapshotUnsubscribe = null;
let cachedTasksArray = []; 

let systemGeneratedOtp = null;
let pendingRegistrationData = null;

// --- UNIVERSAL URL ROUTER ---
function safeRedirect(targetPage) {
    const currentURL = window.location.href;
    const urlObj = new URL(currentURL);
    const pathSegments = urlObj.pathname.split('/');
    pathSegments[pathSegments.length - 1] = targetPage;
    urlObj.pathname = pathSegments.join('/');
    window.location.replace(urlObj.toString());
}

// --- CENTRAL AUTH STATE ---
onAuthStateChanged(auth, (user) => {
    const currentPath = window.location.pathname.toLowerCase();
    
    if (user) {
        if (currentPath.includes("index.html") || currentPath.includes("login.html") || currentPath.endsWith("/")) {
            safeRedirect("dashboard.html");
        }
        setupDashboardInterfaceListeners();
        initClockUtilities();
        setupRealtimeTasks(user.email); 
        injectDynamicFeatureModals(); 
    } else {
        if (currentPath.includes("dashboard.html")) {
            safeRedirect("index.html");
        }
        setupLoginInterfaceListeners();
        setupOtpInputsBehavior(); 
    }
});

// --- HELPERS ---
const validatePassword = (pass) => ({
    hasLength: pass.length >= 6,
    hasUppercase: /[A-Z]/.test(pass),
    hasSpecial: /[!@#$%^&*()-+]/.test(pass)
});

const updateRuleStyle = (el, condition) => {
    if (!el) return;
    el.className = `text-[11px] flex items-center gap-1.5 ${condition ? 'text-emerald-400' : 'text-red-400'}`;
    const icon = el.querySelector('i');
    if(icon) icon.className = `fa-solid ${condition ? 'fa-circle-check' : 'fa-circle-xmark'} text-[10px]`;
};

// --- AUTH LOGIC ---
async function sendOtpViaEmail(recipientEmail, otpCode, mode) {
    const SERVICE_ID = "service_u4kqk8s"; 
    const TEMPLATE_ID = "template_enyyyzs";

    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_email: recipientEmail,
            otp_code: otpCode
        });
        alert(`Verification code sent to ${recipientEmail}`);
        document.getElementById('otpModal')?.classList.remove('hidden');
        document.querySelector('.otp-box')?.focus();
    } catch (error) {
        console.error("Email failed:", error);
        alert("Failed to send verification email.");
    }
}

function setupLoginInterfaceListeners() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const createAccBtn = document.getElementById('createAccBtn');
    const loginBtn = document.getElementById('loginBtn');
    const agreeCheck = document.getElementById('agreeCheck');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');

    if (passwordInput) {
        passwordInput.oninput = () => {
            const val = passwordInput.value;
            const { hasLength, hasUppercase, hasSpecial } = validatePassword(val);
            
            updateRuleStyle(document.getElementById('ruleLength'), hasLength);
            updateRuleStyle(document.getElementById('ruleUppercase'), hasUppercase);
            updateRuleStyle(document.getElementById('ruleSpecial'), hasSpecial);

            let score = (hasLength ? 1 : 0) + (hasUppercase ? 1 : 0) + (hasSpecial ? 1 : 0);
            
            if (strengthBar && strengthText) {
                strengthBar.style.width = val.length === 0 ? "0%" : (score === 3 ? "100%" : "33%");
                strengthBar.className = `h-full transition-all duration-300 ${score === 3 ? 'bg-emerald-500' : 'bg-red-500'}`;
                strengthText.textContent = val.length === 0 ? "Strength: Empty" : (score === 3 ? "Strength: Strong" : "Strength: Weak");
            }
        };
    }

    const handleAuth = async (mode) => {
        const email = emailInput?.value.trim();
        const pass = passwordInput?.value.trim();

        if (!email || !pass) return alert("Fill in all fields.");
        
        const { hasLength, hasUppercase, hasSpecial } = validatePassword(pass);
        if (mode === 'create' && (!hasLength || !hasUppercase || !hasSpecial)) {
            return alert("Password is too weak.");
        }
        if (mode === 'create' && agreeCheck && !agreeCheck.checked) {
            return alert("Agree to terms first.");
        }

        const btn = mode === 'create' ? createAccBtn : loginBtn;
        btn.disabled = true;
        btn.textContent = "Sending Code...";

        systemGeneratedOtp = Math.floor(100000 + Math.random() * 900000);
        pendingRegistrationData = { email, password: pass, mode };
        
        await sendOtpViaEmail(email, systemGeneratedOtp, mode);
        
        btn.disabled = false;
        btn.textContent = mode === 'create' ? "Create Account" : "Login";
    };

    if (createAccBtn) createAccBtn.onclick = (e) => { e.preventDefault(); handleAuth('create'); };
    if (loginBtn) loginBtn.onclick = (e) => { e.preventDefault(); handleAuth('login'); };
}

function setupOtpInputsBehavior() {
    const boxes = document.querySelectorAll('.otp-box');
    const verifyBtn = document.getElementById('verifyOtpBtn');

    boxes.forEach((box, idx) => {
        box.oninput = () => {
            box.value = box.value.replace(/[^0-9]/g, '');
            if (box.value.length === 1 && idx < boxes.length - 1) boxes[idx + 1].focus();
        };
        box.onkeydown = (e) => {
            if (e.key === "Backspace" && !box.value && idx > 0) boxes[idx - 1].focus();
        };
    });

    if (verifyBtn) {
        verifyBtn.onclick = async () => {
            let userOtp = "";
            boxes.forEach(b => userOtp += b.value);

            if (userOtp === String(systemGeneratedOtp)) {
                try {
                    verifyBtn.textContent = "Verifying...";
                    const { email, password, mode } = pendingRegistrationData;
                    if (mode === 'create') {
                        await createUserWithEmailAndPassword(auth, email, password);
                    } else {
                        await signInWithEmailAndPassword(auth, email, password);
                    }
                    document.getElementById('otpModal').classList.add('hidden');
                } catch (err) {
                    alert(err.message);
                } finally {
                    verifyBtn.textContent = "Verify Securely";
                }
            } else {
                alert("Incorrect OTP.");
            }
        };
    }
}

// --- DASHBOARD LOGIC ---
function setupDashboardInterfaceListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    const addTaskBtn = document.getElementById('addTaskBtn');

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            if (snapshotUnsubscribe) snapshotUnsubscribe();
            await signOut(auth);
            safeRedirect("index.html");
        };
    }

    if (addTaskBtn) {
        addTaskBtn.onclick = async () => {
            const title = prompt("Enter task title:");
            if (!title) return;
            try {
                await addDoc(collection(db, "tasks"), {
                    userEmail: auth.currentUser.email,
                    title: title,
                    category: "Work",
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    completed: false,
                    createdAt: new Date()
                });
            } catch (err) { alert(err.message); }
        };
    }
}

function setupRealtimeTasks(userEmail) {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;
    if (snapshotUnsubscribe) snapshotUnsubscribe();

    const q = query(collection(db, "tasks"), where("userEmail", "==", userEmail));
    snapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        taskList.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const task = docSnap.data();
            const id = docSnap.id;
            const item = document.createElement('div');
            item.className = "flex justify-between bg-[#1E2030] p-4 rounded-xl mb-2";
            item.innerHTML = `
                <span>${task.title}</span>
                <button onclick="window.deleteTask('${id}')" class="text-red-400"><i class="fa-solid fa-trash"></i></button>
            `;
            taskList.appendChild(item);
        });
    });
}

// Attach delete to window so inline onclick works
window.deleteTask = async (id) => {
    if(confirm("Delete task?")) await deleteDoc(doc(db, "tasks", id));
};

function initClockUtilities() {
    const timeEl = document.getElementById('liveTime');
    const dateEl = document.getElementById('liveDate');
    setInterval(() => {
        const now = new Date();
        if(timeEl) timeEl.textContent = now.toLocaleTimeString();
        if(dateEl) dateEl.textContent = now.toLocaleDateString();
    }, 1000);
}

function injectDynamicFeatureModals() {
    if (document.getElementById('featureModalContainer')) return;
    const div = document.createElement('div');
    div.id = 'featureModalContainer';
    document.body.appendChild(div);
}