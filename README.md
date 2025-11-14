# Text Diff Checker

A React app to compare two texts and visualize the differences character by character.

## Live Demo

You can try the app online: [https://your-username.github.io/textdiffchecker](https://your-username.github.io/textdiffchecker)

## GitHub Repository

Source code: [https://github.com/your-username/textdiffchecker](https://github.com/your-username/textdiffchecker)

## Usage

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/textdiffchecker.git
   cd textdiffchecker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the app in development mode:
   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

5. To create a production build:
   ```bash
   npm run build
   ```

## Features

- Highlight insertions/deletions in modified text
- Memoriser mode (limit comparison by word count)
- Ignore case / Ignore punctuation options
- Save frequently used texts to a tray for quick access
- Command + Enter and Check button to compare texts
- Zen mode to hide distractions
- Version history and editable tray items

## Deployment

You can deploy to GitHub Pages, Netlify, Vercel, or any static hosting.  
For GitHub Pages:

1. Install gh-pages:
   ```bash
   npm install --save-dev gh-pages
   ```

2. Add the homepage to your `package.json`:
   ```json
   "homepage": "https://your-username.github.io/textdiffchecker"
   ```

3. Deploy:
   ```bash
   npm run build
   npm run deploy
   ```

## License

MIT License