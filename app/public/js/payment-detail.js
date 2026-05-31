// payment-detail.js - Payment Detail Page Logic

// Get payment ID from URL
function getPaymentIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// Format currency
function formatCurrency(amount) {
    return `KES ${parseFloat(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format month (YYYY-MM to readable format)
function formatMonth(monthString) {
    const [year, month] = monthString.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'long' });
}

// Fetch payment details
async function fetchPaymentDetails(paymentId) {
    try {
        const response = await fetch(`/api/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch payment details');
        }

        const payment = await response.json();
        return payment;
    } catch (error) {
        console.error('Error fetching payment:', error);
        throw error;
    }
}

// Fetch payment allocation details
async function fetchPaymentAllocations(paymentId) {
    try {
        const response = await fetch(`/api/payments/${paymentId}/allocations`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });

        if (!response.ok) {
            // If allocations endpoint doesn't exist, return empty array
            console.warn('Allocations endpoint not available');
            return [];
        }

        const allocations = await response.json();
        return allocations;
    } catch (error) {
        console.error('Error fetching allocations:', error);
        return [];
    }
}

// Render payment details
function renderPaymentDetails(payment, allocations) {
    const content = document.getElementById('paymentDetailContent');
    
    // Determine status
    const status = payment.invoice?.status || 'PAID';
    const statusClass = status === 'PAID' ? 'paid' : 'partial';
    const statusText = status === 'PAID' ? 'Fully Allocated' : 'Partially Allocated';

    content.innerHTML = `
        <div class="payment-header">
            <h1>Payment Receipt: ${payment.receiptNo || 'N/A'}</h1>
            <span class="payment-status ${statusClass}">${statusText}</span>
        </div>

        <div class="detail-grid">
            <!-- Payment Information -->
            <div class="detail-card">
                <h3>Payment Information</h3>
                <div class="detail-row">
                    <span class="detail-label">Amount Paid:</span>
                    <span class="detail-value amount">${formatCurrency(payment.amountPaid)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment Date:</span>
                    <span class="detail-value">${formatDate(payment.paymentDate)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Payment Method:</span>
                    <span class="detail-value">${payment.method}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Receipt Number:</span>
                    <span class="detail-value">${payment.receiptNo || 'N/A'}</span>
                </div>
            </div>

            <!-- Resident & Unit Information -->
            <div class="detail-card">
                <h3>Resident & Unit Details</h3>
                <div class="detail-row">
                    <span class="detail-label">Resident Name:</span>
                    <span class="detail-value">${payment.invoice?.resident?.fullName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${payment.invoice?.resident?.email || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Phone:</span>
                    <span class="detail-value">${payment.invoice?.resident?.phone || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Unit Number:</span>
                    <span class="detail-value">${payment.invoice?.resident?.unit?.unitNumber || 'N/A'}</span>
                </div>
            </div>

            <!-- Invoice Information -->
            <div class="detail-card">
                <h3>Invoice Details</h3>
                <div class="detail-row">
                    <span class="detail-label">Invoice Reference:</span>
                    <span class="detail-value">${payment.invoice?.referenceNo || 'N/A'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Total Invoice Amount:</span>
                    <span class="detail-value">${formatCurrency(payment.invoice?.amount || 0)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Total Paid:</span>
                    <span class="detail-value">${formatCurrency(payment.invoice?.totalPaid || 0)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Outstanding:</span>
                    <span class="detail-value">${formatCurrency(payment.invoice?.totalOutstanding || 0)}</span>
                </div>
            </div>

            <!-- Additional Information -->
            <div class="detail-card">
                <h3>Additional Details</h3>
                <div class="detail-row">
                    <span class="detail-label">Recorded By:</span>
                    <span class="detail-value">${payment.recordedBy?.fullName || 'System'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Recorded At:</span>
                    <span class="detail-value">${formatDate(payment.createdAt)}</span>
                </div>
                ${payment.notes ? `
                <div class="detail-row">
                    <span class="detail-label">Notes:</span>
                    <span class="detail-value">${payment.notes}</span>
                </div>
                ` : ''}
            </div>
        </div>

        <!-- Payment Allocation Breakdown -->
        <div class="allocation-table">
            <h3>Payment Allocation (FIFO - Oldest First)</h3>
            ${allocations.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Base Amount</th>
                            <th>Late Fee</th>
                            <th>Total Due</th>
                            <th>Amount Allocated</th>
                            <th>Remaining</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allocations.map(allocation => `
                            <tr>
                                <td>
                                    <span class="month-badge">${formatMonth(allocation.month)}</span>
                                </td>
                                <td>${formatCurrency(allocation.baseAmount)}</td>
                                <td>${formatCurrency(allocation.lateFee || 0)}</td>
                                <td>${formatCurrency(allocation.baseAmount + (allocation.lateFee || 0))}</td>
                                <td><strong>${formatCurrency(allocation.amountPaid)}</strong></td>
                                <td>${formatCurrency(allocation.amountRemaining)}</td>
                                <td>
                                    <span class="payment-status ${allocation.status.toLowerCase()}">
                                        ${allocation.status}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : `
                <div class="no-data">
                    No allocation breakdown available. This payment may have been recorded before the FIFO allocation system was implemented.
                </div>
            `}
        </div>
    `;
}

// Show error message
function showError(message) {
    const content = document.getElementById('paymentDetailContent');
    content.innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${message}
        </div>
        <a href="index.html?page=payments" class="back-button">← Back to Payments</a>
    `;
}

// Initialize page
async function initPaymentDetail() {
    const paymentId = getPaymentIdFromUrl();
    
    if (!paymentId) {
        showError('No payment ID provided');
        return;
    }

    try {
        // Fetch payment details
        const payment = await fetchPaymentDetails(paymentId);
        
        // Fetch allocations (if available)
        const allocations = await fetchPaymentAllocations(paymentId);
        
        // Render the page
        renderPaymentDetails(payment, allocations);
        
    } catch (error) {
        showError(error.message || 'Failed to load payment details');
    }
}

// Run on page load
document.addEventListener('DOMContentLoaded', initPaymentDetail);