let db;
const DB_NAME = 'SpendWiseDB';
const STORE_EXPENSES = 'expenses';
const STORE_TAGS = 'tags';

const form = document.getElementById('expense-form');
const list = document.getElementById('expense-list');
const monthFilter = document.getElementById('month-filter');
const tagSelect = document.getElementById('tag');
const newTagInput = document.getElementById('new-tag');
const addTagBtn = document.getElementById('add-tag-btn');
const deleteTagBtn = document.getElementById('delete-tag-btn');
const startDateFilterInput = document.getElementById('start-date-filter');
const endDateFilterInput = document.getElementById('end-date-filter');

// Helper to get all items from an object store
async function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}
// 1. PINPOINT: IndexedDB Initialization Logic
const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
                db.createObjectStore(STORE_EXPENSES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_TAGS)) {
                db.createObjectStore(STORE_TAGS, { keyPath: 'name' });
                // Default tags
                const tagStore = e.target.transaction.objectStore(STORE_TAGS);
                ['Food', 'Clothes', 'Transport', 'Bills', 'Other'].forEach(t => tagStore.add({ name: t }));
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
};

// 2. PINPOINT: Database Access Helpers
async function saveToStore(storeName, item) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    return new Promise(resolve => tx.oncomplete = resolve);
}

async function deleteFromStore(storeName, id) {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    return new Promise(resolve => tx.oncomplete = resolve);
}

// Set default month for the filter (Current Month)
const now = new Date();
monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
document.getElementById('date').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

async function renderTags() {
    const tags = await getAllFromStore(STORE_TAGS);
    tagSelect.innerHTML = tags.map(tag => `<option value="${tag.name}">${tag.name}</option>`).join('');
}

addTagBtn.addEventListener('click', async () => {
    const newTagName = newTagInput.value.trim();
    if (newTagName) {
        await saveToStore(STORE_TAGS, { name: newTagName });
        await renderTags();
        newTagInput.value = '';
        tagSelect.value = newTagName;
    }
});

deleteTagBtn.addEventListener('click', async () => {
    const selectedTag = tagSelect.value;
    if (!selectedTag) return;

    if (confirm(`Are you sure you want to delete the tag "${selectedTag}"?`)) {
        // First, remove all expenses associated with this tag
        const allExpenses = await getAllFromStore(STORE_EXPENSES);
        const expensesToDelete = allExpenses.filter(ex => ex.tag === selectedTag);
        for (const expense of expensesToDelete) {
            await deleteFromStore(STORE_EXPENSES, expense.id);
        }
        await deleteFromStore(STORE_TAGS, selectedTag);
        // Then, re-render everything
        await renderTags();
        await render(); // Re-render expenses as some might have been deleted
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const expense = {
        id: Date.now(),
        description: document.getElementById('description').value.trim(),
        amount: parseFloat(document.getElementById('amount').value),
        tag: tagSelect.value,
        date: document.getElementById('date').value
    };
    await saveToStore(STORE_EXPENSES, expense);
    render();
    form.reset();
    const d = new Date();
    document.getElementById('date').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

window.deleteExpense = async (id) => {
    await deleteFromStore(STORE_EXPENSES, id);
    render();
};

async function render() {
    const expenses = await getAllFromStore(STORE_EXPENSES);
    let filtered = [];
    
    const startRangeDateValue = startDateFilterInput.value;
    const endRangeDateValue = endDateFilterInput.value;
    const selectedMonthValue = monthFilter.value;

    if (startRangeDateValue && endRangeDateValue) {
        // Priority 1: Use date range filter if both are provided
        const start = new Date(startRangeDateValue + 'T00:00:00');
        const end = new Date(endRangeDateValue + 'T23:59:59'); // Include the whole end day

        filtered = expenses.filter(ex => {
            const d = new Date(ex.date + 'T00:00:00');
            return d >= start && d <= end;
        });
    } else if (selectedMonthValue) {
        // Priority 2: Fallback to month filter if date range is not fully provided but month is
        const [year, month] = selectedMonthValue.split('-').map(Number);
        filtered = expenses.filter(ex => {
            const d = new Date(ex.date + 'T00:00:00');
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
        });
    } else {
        // No filter selected, show nothing
        list.innerHTML = '';
        calculateStats([]);
        return;
    }

    // Render List
    list.innerHTML = filtered.map(ex => `
        <li class="expense-item">
            <div>
                ${ex.description ? `<strong>${ex.description}</strong><br>` : ''}
                <small>${ex.tag} | ${ex.date}</small>
            </div>
            <div class="expense-actions">
                <strong>${ex.amount.toFixed(2)} DH</strong>
                <button onclick="deleteExpense(${ex.id})" class="btn-delete">×</button>
            </div>
        </li>
    `).join('');

    calculateStats(filtered);
}

function calculateStats(data) {
    const total = data.reduce((sum, ex) => sum + ex.amount, 0);
    document.getElementById('total-amount').innerText = `${total.toFixed(2)}DH`;

    if (total === 0) {
        document.getElementById('tag-breakdown').innerHTML = '';
        return;
    }

    const tagTotals = {};
    data.forEach(ex => {
        tagTotals[ex.tag] = (tagTotals[ex.tag] || 0) + ex.amount;
    });

    const breakdown = document.getElementById('tag-breakdown');
    breakdown.innerHTML = Object.keys(tagTotals).map(tag => {
        const percent = ((tagTotals[tag] / total) * 100).toFixed(1);
        return `
            <div class="tag-bar-container">
                <div class="tag-label">
                    <span>${tag}</span>
                    <span>${percent}% (${tagTotals[tag].toFixed(2)}DH)</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

startDateFilterInput.addEventListener('change', render);
endDateFilterInput.addEventListener('change', render);
monthFilter.addEventListener('change', render);

initDB().then(() => {
    renderTags();
    render();
});
