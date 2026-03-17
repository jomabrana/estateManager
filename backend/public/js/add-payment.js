// ═══════════════════════════════════════════════════════════════════════════════
// ADD PAYMENT PAGE — Phase 4 with FIFO + Auto-Generate Receipt
// Manual payment recording (Cash, Bank Transfer, Check)
// ═══════════════════════════════════════════════════════════════════════════════

// ── GENERATE PROFESSIONAL RECEIPT NUMBER ────────────────────────────────────────
function generateReceipt() {
  // Format: REC-YYYYMMDD-XXXX
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  
  const receipt = `REC-${year}${month}${day}-${random}`;
  
  // Set the value in the input field
  document.getElementById('payment-receipt').value = receipt;
  
  // Show feedback
  console.log('✅ Generated receipt:', receipt);
  
  // Optional: Show brief notification
  if (typeof showNotification === 'function') {
    showNotification(`Generated receipt: ${receipt}`, 'success');
  }
}

// Load invoices for dropdown
async function loadAddPayment() {
  const token = localStorage.getItem('token');
  const select = document.getElementById('payment-invoice');
  
  try {
    console.log('📥 Fetching invoices...');
    
    // Fetch all invoices - we'll filter client-side for pending/overdue/partial
    const res = await fetch('/api/invoices', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`Response status: ${res.status}`);
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    
    const data = await res.json();
    console.log('✅ Invoices loaded:', data.invoices?.length || 0);
    
    select.innerHTML = '<option value="">Select Invoice...</option>';
    
    const invoices = data.invoices || [];
    
    // Filter to only show pending/overdue/partial invoices
    const pendingInvoices = invoices.filter(inv => 
      ['PENDING', 'OVERDUE', 'PARTIAL'].includes(inv.status)
    );
    
    if (pendingInvoices.length === 0) {
      select.innerHTML = '<option value="">No pending invoices</option>';
      console.warn('⚠️  No pending invoices found');
      return;
    }
    
    // Populate dropdown
    pendingInvoices.forEach(invoice => {
      const opt = document.createElement('option');
      opt.value = invoice.id;
      
      try {
        const residentName = invoice.resident?.fullName || 'Unknown';
        const unitNumber = invoice.unit?.unitNumber || 'N/A';
        const outstanding = parseFloat(invoice.totalOutstanding) || parseFloat(invoice.amount) || 0;
        const status = invoice.status || 'Unknown';
        
        const displayText = `${residentName} - Unit ${unitNumber} | ${status} | Due: KES ${outstanding.toLocaleString()}`;
        opt.textContent = displayText;
        select.appendChild(opt);
      } catch (err) {
        console.error('Error rendering option:', err, invoice);
      }
    });
    
    console.log(`✅ Loaded ${pendingInvoices.length} pending invoices`);
    
  } catch (err) {
    console.error('❌ Error loading invoices:', err);
    select.innerHTML = `<option value="">Error: ${err.message}</option>`;
    
    // Show error notification
    if (typeof showNotification === 'function') {
      showNotification(`Error loading invoices: ${err.message}`, 'error');
    }
  }
}

// Set today's date as default
document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('payment-date');
  if (dateInput) {
    dateInput.valueAsDate = new Date();
  }
  
  // Load invoices
  loadAddPayment();
  
  console.log('✅ Page initialized');
});

// Update outstanding amount when invoice changes
document.getElementById('payment-invoice')?.addEventListener('change', async (e) => {
  const invoiceId = e.target.value;
  if (!invoiceId) {
    document.getElementById('payment-amount').placeholder = 'Select invoice first';
    document.getElementById('payment-amount').value = '';
    return;
  }
  
  const token = localStorage.getItem('token');
  try {
    console.log(`📥 Fetching invoice ${invoiceId} details...`);
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    const invoice = data.invoice;
    
    console.log('✅ Invoice loaded:', invoice.referenceNo);
    
    // Update amount field with outstanding amount
    const amountField = document.getElementById('payment-amount');
    if (amountField && invoice) {
      const outstanding = parseFloat(invoice.totalOutstanding) || parseFloat(invoice.amount) || 0;
      amountField.placeholder = `Outstanding: KES ${outstanding.toLocaleString()}`;
      amountField.value = outstanding;
    }
  } catch (err) {
    console.error('❌ Error loading invoice details:', err);
    if (typeof showNotification === 'function') {
      showNotification(`Error loading invoice: ${err.message}`, 'error');
    }
  }
});

// ── FORM SUBMISSION ────────────────────────────────────────────────────────────
document.getElementById('payment-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const invoiceId = document.getElementById('payment-invoice').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);
  const method = document.getElementById('payment-method').value;
  const paymentDate = document.getElementById('payment-date').value;
  const receiptNo = document.getElementById('payment-receipt').value.trim();
  const notes = document.getElementById('payment-notes')?.value.trim() || null;
  
  const token = localStorage.getItem('token');
  
  console.log('📤 Submitting payment...', { invoiceId, amount, method, paymentDate, receiptNo });
  
  // Validation
  if (!invoiceId) {
    showPaymentError('Please select an invoice');
    return;
  }
  
  if (!amount || amount <= 0) {
    showPaymentError('Please enter a valid amount');
    return;
  }
  
  if (!method) {
    showPaymentError('Please select a payment method');
    return;
  }
  
  if (!paymentDate) {
    showPaymentError('Please select a payment date');
    return;
  }
  
  if (!receiptNo) {
    showPaymentError('Receipt number is required. Click "Generate" or enter your own.');
    return;
  }
  
  const btn = document.querySelector('button[type="submit"]');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner"></i> Recording...';
  
  try {
    // ✅ USE PHASE 4 ENDPOINT WITH FIFO ALLOCATION ✅
    const res = await fetch(`/api/invoices/${invoiceId}/record-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        amountPaid: amount,
        paymentDate,
        method,
        receiptNo,
        notes
      })
    });
    
    const data = await res.json();
    
    console.log(`Response: ${res.status}`, data);
    
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record payment');
    }
    
    // ✅ SUCCESS - Show allocation details
    if (typeof showNotification === 'function') {
      showNotification(`✅ Payment recorded successfully!`, 'success');
      
      if (data.allocations && data.allocations.length > 0) {
        const allocText = data.allocations
          .map(a => `${a.month}: KES ${parseInt(a.allocated).toLocaleString()}`)
          .join(' → ');
        showNotification(`Allocated (FIFO): ${allocText}`, 'info');
      }
    }
    
    console.log('✅ Payment recorded, redirecting...');
    
    // Redirect after 2 seconds
    setTimeout(() => {
      window.location.href = '/?page=payments';
    }, 2000);
    
  } catch (err) {
    console.error('❌ Error recording payment:', err);
    showPaymentError(err.message || 'Error recording payment');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});

// ── ERROR HANDLING ────────────────────────────────────────────────────────────

function showPaymentError(msg) {
  console.error('❌ Form Error:', msg);
  if (typeof showNotification === 'function') {
    showNotification(msg, 'error');
  } else {
    alert(msg);
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────────

function formatKES(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  }).format(parseFloat(amount) || 0);
}