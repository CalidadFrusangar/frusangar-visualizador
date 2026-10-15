import React from 'react';
import { ExternalLink } from 'lucide-react';

const odooOrderUrl = (orderId) => `/api/odoo/sale-order/${orderId}`;

// Opens the sale order in Odoo in a new tab without triggering the parent's click
const OdooLink = ({ orderId, label = 'Odoo', className = '' }) => {
    if (!orderId) return null;
    return (
        <a
            href={odooOrderUrl(orderId)}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir el pedido en Odoo"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 ${className}`}
        >
            <ExternalLink size={11} /> {label}
        </a>
    );
};

export default OdooLink;
