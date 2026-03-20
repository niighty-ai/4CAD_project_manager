'use strict';

/**
 * Utility functions for date parsing and formatting.
 */

// Parse date string to Date object
function parseDate(dateString) {
    return new Date(dateString);
}

// Format Date object to specified format
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' };
    return new Intl.DateTimeFormat('en-CA', options).format(date);
}

/**
 * Utility functions for color operations.
 */

// Convert RGB to Hex
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

// Convert Hex to RGB
function hexToRgb(hex) {
    const bigint = parseInt(hex.replace(/^#/, ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

module.exports = { parseDate, formatDate, rgbToHex, hexToRgb };