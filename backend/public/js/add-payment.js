// Load invoices for dropdown
async function loadAddPayment() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('payment-invoice');
    
    try {
        const res = await fetch('/api/invoices?status=PENDING', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        
        select.innerHTML = '<option value="">Select...</option>';
        data.invoices?.forEach(invoice => {
            const opt = document.createElement('option');
            opt.value = invoice.id;
            opt.textContent = `${invoice.residentName} - Unit ${invoice.unitNumber} (KES ${invoice.amount})`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading invoices:', err);
    }
}

// Set today's date as default
document.getElementById('payment-date').valueAsDate = new Date();

// Handle form submission
document.getElementById('payment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const data = {
        invoiceId: document.getElementById('payment-invoice').value,
        amountPaid: parseFloat(document.getElementById('payment-amount').value),
        paymentMethod: document.getElementById('payment-method').value,
        paymentDate: document.getElementById('payment-date').value
    };
    
    try {
        const res = await fetch('/api/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            showNotification('Payment recorded successfully', 'success');
            setTimeout(() => window.location.href = './payments.html', 1500);
        } else {
            showNotification('Failed to record payment', 'error');
        }
    } catch (err) {
        console.error('Error recording payment:', err);
        showNotification('Error recording payment', 'error');
    }
});

// Load on page load
loadAddPayment();
