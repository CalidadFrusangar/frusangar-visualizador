/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                frusangar: {
                    green: '#7ab800', // Apple/Leaf Green from logo
                    dark: '#4a7729',  // Darker green from lines
                    orange: '#ea7600', // Orange from logo dot
                    brown: '#5d5d5d', // Dark grey/brown for text "PATATAS"
                    light: '#f4f9e8', // Very light green background
                }
            }
        },
    },
    plugins: [],
}
