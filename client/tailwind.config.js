/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Outfit', 'sans-serif'], // For headers if needed
            },
            colors: {
                frusangar: {
                    green: '#66A500', // Adjusted Apple Green - Vibrant but readable
                    dark: '#3A5E22',  // Deep Forest Green
                    accent: '#d9f99d', // Lime 200 equivalent for highlights
                    orange: '#F58220', // Vibrant Orange from logo
                    'orange-light': '#FFF0E0',
                    text: '#2D3748', // Slate 800 - Professional dark grey
                    muted: '#718096', // Slate 500 - Professional muted text
                    light: '#F7FAFC', // Slate 50 - Clean background
                    white: '#FFFFFF',
                }
            },
            boxShadow: {
                'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
                'float': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }
        },
    },
    plugins: [],
}
