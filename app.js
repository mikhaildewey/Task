import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// REPLACE WITH YOUR FIREBASE CONFIGURATION OBJECT
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

const loginBtn = document.getElementById('loginBtn');
const createAccBtn = document.getElementById('createAccBtn');
const addTaskBtn = document.getElementById('addTaskBtn');
const logoutBtn = document.getElementById('logoutBtn');

// --- CENTRAL AUTH STATE ROUTER PIPELINE ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (loginBtn || createAccBtn) {
            window.location.replace("dashboard.html");
        } 
        if (addTaskBtn) {
            const emailDisplay = document.getElementById('userEmail');
            if (emailDisplay) emailDisplay.textContent = user.email;
            initClockUtilities();
            setupRealtimeTasks();
            setupDashboardInterfaceListeners();
        }
    } else {
        if (addTaskBtn || logoutBtn) {
            window.location.replace("LOGIN.html");
        }
        if (loginBtn || createAccBtn) {
            setupLoginInterfaceListeners();
        }
    }
});

// --- LOGIN & REGISTER CONTROL HANDLERS (WITH TERMS CONSTRAINTS) ---
function setupLoginInterfaceListeners() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const agreeCheck = document.getElementById('agreeCheck');
    
    // Modal Element Pointers
    const termsLink = document.getElementById('termsLink');
    const termsModal = document.getElementById('termsModal');
    const closeTermsBtn = document.getElementById('closeTermsBtn');
    const acceptTermsBtn = document.getElementById('acceptTermsBtn');

    // Modal Interaction Control Pipeline
    if (termsLink && termsModal) {
        termsLink.onclick = (e) => {
            e.preventDefault();
            termsModal.classList.remove('hidden');
            setTimeout(() => termsModal.classList.add('opacity-100'), 10);
        };

        const hideModal = () => {
            termsModal.classList.remove('opacity-100');
            setTimeout(() => termsModal.classList.add('hidden'), 300);
        };

        if (closeTermsBtn) closeTermsBtn.onclick = hideModal;
        if (acceptTermsBtn) {
            acceptTermsBtn.onclick = () => {
                if (agreeCheck) agreeCheck.checked = true;
                hideModal();
            };
        }
    }

    // Account Creation Event Handler
    if (createAccBtn) {
        const newCreateBtn = createAccBtn.cloneNode(true);
        createAccBtn.parentNode.replaceChild(newCreateBtn, createAccBtn);

        newCreateBtn.onclick = async (e) => {
            e.preventDefault();
            if (!agreeCheck || !agreeCheck.checked) {
                return alert("You must read and agree to the Terms & Conditions to create an account.");
            }
            if (!emailInput.value || !passwordInput.value) return alert("Please fill in email and password fields.");
            
            try {
                newCreateBtn.textContent = "Creating Account...";
                await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            } catch (error) {
                alert("Registration Failed: " + error.message);
                newCreateBtn.textContent = "Create Account";
            }
        };
    }

    // Authentication Session Login Event Handler
    if (loginBtn) {
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        
        newLoginBtn.onclick = async (e) => {
            e.preventDefault();
            if (!emailInput.value || !passwordInput.value) return alert("Please fill in email and password fields.");
            
            try {
                newLoginBtn.textContent = "Logging in...";
                await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            } catch (error) {
                alert("Login Failed: " + error.message);
                newLoginBtn.textContent = "Login";
            }
        };
    }
}

// --- TIME CLOCK ROUTINE ---
function initClockUtilities() {
    const timeEl = document.getElementById('liveTime');
    const dateEl = document.getElementById('liveDate');
    
    function refreshClock() {
        const now = new Date();
        if(timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if(dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    refreshClock();
    setInterval(refreshClock, 1000);
}

// --- DASHBOARD UI INTERFACE LISTENERS ---
function setupDashboardInterfaceListeners() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const targetBoard = document.getElementById('priorityTasksBoard');

    // Sidebar View Jump Target Elements Anchors Helper Routine
    const jumpToSection = (element) => {
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Feature Cards Events Mapping
    const taskTriggers = ['sideNavTasks', 'featureCardTasks', 'sideNavHome', 'featureCardCalendar', 'featureCardReminders', 'featureCardInbox'];
    taskTriggers.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => {
                jumpToSection(targetBoard);
                if (id.startsWith('featureCard') && id !== 'featureCardTasks') {
                    alert(`${btn.querySelector('h4').textContent} system utilities are fully synced below inside the Task Manager logs tracker.`);
                }
            };
        }
    });

    // Mobile Navigation Burger Menu Controller
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('-translate-x-full');
        };
        document.body.onclick = () => {
            sidebar.classList.add('-translate-x-full');
        };
    }

    if (logoutBtn) logoutBtn.onclick = () => signOut(auth);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.oninput = (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            setupRealtimeTasks(); 
        };
    }

    const filters = { 'filterAll': 'All', 'filterWork': 'Work', 'filterPersonal': 'Personal' };
    Object.keys(filters).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => {
                currentCategoryFilter = filters[id];
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('bg-[#252836]', 'text-white');
                    b.classList.add('text-gray-400');
                });
                btn.classList.add('bg-[#252836]', 'text-white');
                btn.classList.remove('text-gray-400');
                setupRealtimeTasks();
            };
        }
    });

    if (addTaskBtn) {
        addTaskBtn.onclick = async () => {
            const title = prompt("Enter priority description context:");
            if (!title || !title.trim()) return;
            
            const categoryInput = prompt("Set category tracking domain (Work / Personal):", "Work");
            let finalCategory = "Work";
            if(categoryInput && categoryInput.toLowerCase() === 'personal') finalCategory = "Personal";

            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            try {
                await addDoc(collection(db, "tasks"), {
                    title: title.trim(),
                    category: finalCategory,
                    time: timeStr,
                    completed: false,
                    createdAt: new Date()
                });
            } catch (error) {
                alert("Task Write Blocked: " + error.message);
            }
        };
    }
}

// --- DATA READ QUERY RENDERING PIPELINE STREAM ---
function setupRealtimeTasks() {
    if (snapshotUnsubscribe) snapshotUnsubscribe(); 

    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

    snapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        taskList.innerHTML = '';
        let total = 0, completedCount = 0, pendingCount = 0;

        snapshot.forEach((docSnapshot) => {
            const task = docSnapshot.data();
            const id = docSnapshot.id;

            total++;
            if (task.completed) completedCount++; else pendingCount++;

            if (currentCategoryFilter !== "All" && task.category !== currentCategoryFilter) return;
            if (currentSearchQuery && !task.title.toLowerCase().includes(currentSearchQuery)) return;

            const row = document.createElement('div');
            row.className = `flex items-center justify-between bg-[#1E2030] p-4 rounded-xl mb-1 border border-transparent hover:border-[#7B51D3] transition group ${task.completed ? 'opacity-50' : ''}`;
            const tagColorClass = task.category === 'Work' ? 'bg-[#7B51D3]/20 text-[#9366F9]' : 'bg-emerald-500/20 text-emerald-400';

            row.innerHTML = `
                <div class="flex items-center space-x-4 flex-1 min-w-0">
                    <input type="checkbox" data-id="${id}" ${task.completed ? 'checked' : ''} class="task-toggle-checkbox w-5 h-5 rounded bg-[#0F1015] border-gray-600 text-[#7B51D3] focus:ring-[#7B51D3] cursor-pointer accent-[#7B51D3]">
                    <div class="truncate">
                        <p class="font-semibold text-sm ${task.completed ? 'line-through text-gray-500' : 'text-gray-200'} truncate">${task.title}</p>
                        <p class="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            <span class="${tagColorClass} px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">${task.category}</span>
                            <span><i class="fa-regular fa-clock mr-1"></i>${task.time}</span>
                        </p>
                    </div>
                </div>
                <button data-id="${id}" class="delete-task-btn text-gray-500 hover:text-red-400 text-xs font-semibold md:opacity-0 group-hover:opacity-100 transition px-2 py-1">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            taskList.appendChild(row);
        });

        if(document.getElementById('totalTasksCount')) document.getElementById('totalTasksCount').textContent = total;
        if(document.getElementById('completedTasksCount')) document.getElementById('completedTasksCount').textContent = completedCount;
        if(document.getElementById('pendingTasksCount')) document.getElementById('pendingTasksCount').textContent = pendingCount;
        if(document.getElementById('sideBadgeTasks')) document.getElementById('sideBadgeTasks').textContent = pendingCount;

        if (taskList.children.length === 0) {
            taskList.innerHTML = `<p class="text-gray-500 text-xs text-center py-8">No matching priority items found.</p>`;
        }
        attachDynamicItemListeners();
    });
}

function attachDynamicItemListeners() {
    document.querySelectorAll('.task-toggle-checkbox').forEach(box => {
        box.onchange = async (e) => {
            const targetId = e.target.getAttribute('data-id');
            try {
                await updateDoc(doc(db, "tasks", targetId), { completed: e.target.checked });
            } catch (err) { console.error("Task modification failed:", err); }
        };
    });

    document.querySelectorAll('.delete-task-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const targetId = e.currentTarget.getAttribute('data-id');
            if (confirm("Permanently delete this task item?")) {
                try { await deleteDoc(doc(db, "tasks", targetId)); } catch (err) { console.error("Deletion failed:", err); }
            }
        };
    });
}