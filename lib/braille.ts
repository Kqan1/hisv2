/**
 * 6-dot Braille mapping and text-to-matrix rendering.
 * 
 * Standard 6-dot braille uses a 2-column × 3-row cell:
 *   [dot1] [dot4]
 *   [dot2] [dot5]
 *   [dot3] [dot6]
 * 
 * Each character maps to a combination of these 6 dots.
 */

// Braille dot patterns: [dot1, dot2, dot3, dot4, dot5, dot6]
// 1 = raised, 0 = not raised
const BRAILLE_MAP: Record<string, number[]> = {
    'a': [1, 0, 0, 0, 0, 0],
    'b': [1, 1, 0, 0, 0, 0],
    'c': [1, 0, 0, 1, 0, 0],
    'd': [1, 0, 0, 1, 1, 0],
    'e': [1, 0, 0, 0, 1, 0],
    'f': [1, 1, 0, 1, 0, 0],
    'g': [1, 1, 0, 1, 1, 0],
    'h': [1, 1, 0, 0, 1, 0],
    'i': [0, 1, 0, 1, 0, 0],
    'j': [0, 1, 0, 1, 1, 0],
    'k': [1, 0, 1, 0, 0, 0],
    'l': [1, 1, 1, 0, 0, 0],
    'm': [1, 0, 1, 1, 0, 0],
    'n': [1, 0, 1, 1, 1, 0],
    'o': [1, 0, 1, 0, 1, 0],
    'p': [1, 1, 1, 1, 0, 0],
    'q': [1, 1, 1, 1, 1, 0],
    'r': [1, 1, 1, 0, 1, 0],
    's': [0, 1, 1, 1, 0, 0],
    't': [0, 1, 1, 1, 1, 0],
    'u': [1, 0, 1, 0, 0, 1],
    'v': [1, 1, 1, 0, 0, 1],
    'w': [0, 1, 0, 1, 1, 1],
    'x': [1, 0, 1, 1, 0, 1],
    'y': [1, 0, 1, 1, 1, 1],
    'z': [1, 0, 1, 0, 1, 1],

    // Numbers use number indicator (⠼) prefix + letters a-j
    // For simplicity, we render them as their letter equivalent with a number indicator
    '1': [1, 0, 0, 0, 0, 0], // same as 'a'
    '2': [1, 1, 0, 0, 0, 0], // same as 'b'
    '3': [1, 0, 0, 1, 0, 0], // same as 'c'
    '4': [1, 0, 0, 1, 1, 0], // same as 'd'
    '5': [1, 0, 0, 0, 1, 0], // same as 'e'
    '6': [1, 1, 0, 1, 0, 0], // same as 'f'
    '7': [1, 1, 0, 1, 1, 0], // same as 'g'
    '8': [1, 1, 0, 0, 1, 0], // same as 'h'
    '9': [0, 1, 0, 1, 0, 0], // same as 'i'
    '0': [0, 1, 0, 1, 1, 0], // same as 'j'

    // Number indicator ⠼
    '#': [0, 1, 1, 1, 1, 1],

    // Punctuation
    '.': [0, 1, 0, 0, 1, 1],
    ',': [0, 1, 0, 0, 0, 0],
    '!': [0, 1, 1, 0, 1, 0],
    '?': [0, 1, 0, 0, 1, 1],
    ';': [0, 1, 1, 0, 0, 0],
    ':': [0, 1, 0, 0, 1, 0],
    '-': [0, 0, 1, 0, 0, 1],
    "'": [0, 0, 1, 0, 0, 0],
    '"': [0, 1, 1, 0, 0, 1],  // opening quote
    '(': [0, 1, 1, 0, 0, 1],
    ')': [0, 1, 1, 0, 0, 1],
    '/': [0, 0, 1, 1, 0, 0],

    // Capital indicator ⠠
    'CAP': [0, 0, 0, 0, 0, 1],
};

// Cell dimensions on the grid
const CELL_WIDTH = 2;   // 2 columns per braille character
const CELL_HEIGHT = 3;  // 3 rows per braille character
const CHAR_GAP = 1;     // 1 column gap between characters
const LINE_GAP = 1;     // 1 row gap between lines
const WORD_GAP = 1;     // extra gap for spaces (total = CHAR_GAP + WORD_GAP)

/**
 * Render a single braille character onto a matrix at the given position.
 * Dots layout:
 *   [dot1] [dot4]   ->  (startRow+0, startCol+0)  (startRow+0, startCol+1)
 *   [dot2] [dot5]   ->  (startRow+1, startCol+0)  (startRow+1, startCol+1)
 *   [dot3] [dot6]   ->  (startRow+2, startCol+0)  (startRow+2, startCol+1)
 */
function renderBrailleChar(
    matrix: number[][],
    dots: number[],
    startRow: number,
    startCol: number
): void {
    const rows = matrix.length;
    const cols = matrix[0].length;

    // Map: dot1=dots[0], dot2=dots[1], dot3=dots[2], dot4=dots[3], dot5=dots[4], dot6=dots[5]
    const positions = [
        [startRow + 0, startCol + 0, dots[0]], // dot 1
        [startRow + 1, startCol + 0, dots[1]], // dot 2
        [startRow + 2, startCol + 0, dots[2]], // dot 3
        [startRow + 0, startCol + 1, dots[3]], // dot 4
        [startRow + 1, startCol + 1, dots[4]], // dot 5
        [startRow + 2, startCol + 1, dots[5]], // dot 6
    ];

    for (const [r, c, val] of positions) {
        if (r >= 0 && r < rows && c >= 0 && c < cols && val === 1) {
            matrix[r][c] = 1;
        }
    }
}

/**
 * Convert a text string into an array of braille matrix pages.
 * Each page is a rows×cols matrix with values -1 (off) or 1 (on).
 * 
 * Characters are laid out left-to-right, top-to-bottom.
 * When a line runs out of horizontal space, it wraps to the next line.
 * When a page runs out of vertical space, a new page is started.
 */
export function textToBraillePages(
    text: string,
    rows: number = 10,
    cols: number = 15
): number[][][] {
    const pages: number[][][] = [];
    const charStep = CELL_WIDTH + CHAR_GAP;   // columns to advance per char
    const lineStep = CELL_HEIGHT + LINE_GAP;  // rows to advance per line

    // Max characters per line and lines per page
    const maxCharsPerLine = Math.floor((cols + CHAR_GAP) / charStep);
    const maxLinesPerPage = Math.floor((rows + LINE_GAP) / lineStep);

    let currentMatrix = createEmptyMatrix(rows, cols);
    let cursorCol = 0;  // character index in current line
    let cursorLine = 0; // line index in current page

    // Preprocess: convert to lowercase, handle capitals and numbers
    const tokens = tokenizeText(text);

    for (const token of tokens) {
        if (token === ' ') {
            // Space: advance cursor by one extra gap
            cursorCol++;
            if (cursorCol >= maxCharsPerLine) {
                cursorCol = 0;
                cursorLine++;
                if (cursorLine >= maxLinesPerPage) {
                    pages.push(currentMatrix);
                    currentMatrix = createEmptyMatrix(rows, cols);
                    cursorLine = 0;
                }
            }
            continue;
        }

        if (token === '\n') {
            // Newline: go to next line
            cursorCol = 0;
            cursorLine++;
            if (cursorLine >= maxLinesPerPage) {
                pages.push(currentMatrix);
                currentMatrix = createEmptyMatrix(rows, cols);
                cursorLine = 0;
            }
            continue;
        }

        const dots = BRAILLE_MAP[token];
        if (!dots) continue; // Skip unmapped characters

        // Check if we need to wrap
        if (cursorCol >= maxCharsPerLine) {
            cursorCol = 0;
            cursorLine++;
            if (cursorLine >= maxLinesPerPage) {
                pages.push(currentMatrix);
                currentMatrix = createEmptyMatrix(rows, cols);
                cursorLine = 0;
            }
        }

        const pixelCol = cursorCol * charStep;
        const pixelRow = cursorLine * lineStep;

        renderBrailleChar(currentMatrix, dots, pixelRow, pixelCol);
        cursorCol++;
    }

    // Push the last page if it has content
    if (hasContent(currentMatrix)) {
        pages.push(currentMatrix);
    }

    // If no pages were created, return one empty page
    if (pages.length === 0) {
        pages.push(createEmptyMatrix(rows, cols));
    }

    return pages;
}

/**
 * Tokenize text into braille tokens.
 * Handles: capital indicators before uppercase letters,
 * number indicators before digit sequences.
 */
function tokenizeText(text: string): string[] {
    const tokens: string[] = [];
    let inNumber = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === ' ') {
            tokens.push(' ');
            inNumber = false;
            continue;
        }

        if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++; // skip \r\n
            tokens.push('\n');
            inNumber = false;
            continue;
        }

        // Digits: insert number indicator before first digit in a sequence
        if (ch >= '0' && ch <= '9') {
            if (!inNumber) {
                tokens.push('#');
                inNumber = true;
            }
            tokens.push(ch);
            continue;
        }

        inNumber = false;

        // Uppercase: insert capital indicator
        if (ch >= 'A' && ch <= 'Z') {
            tokens.push('CAP');
            tokens.push(ch.toLowerCase());
            continue;
        }

        // Lowercase letters and punctuation
        tokens.push(ch.toLowerCase());
    }

    return tokens;
}

function createEmptyMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => Array(cols).fill(-1));
}

function hasContent(matrix: number[][]): boolean {
    return matrix.some(row => row.some(cell => cell === 1));
}

export { BRAILLE_MAP, CELL_WIDTH, CELL_HEIGHT };
