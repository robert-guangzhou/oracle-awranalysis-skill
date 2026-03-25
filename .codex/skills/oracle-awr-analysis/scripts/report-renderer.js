const fs = require('fs');
const path = require('path');
const {
    AlignmentType,
    Bookmark,
    BorderStyle,
    Document,
    Footer,
    Header,
    HeadingLevel,
    InternalHyperlink,
    LevelFormat,
    Packer,
    PageNumber,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType
} = require('docx');

const PAGE_WIDTH_A4 = 11906;
const PAGE_HEIGHT_A4 = 16838;
const PAGE_MARGIN_LEFT_RIGHT = 1440;
const PAGE_MARGIN_TOP_BOTTOM = 1134;
const CONTENT_WIDTH = PAGE_WIDTH_A4 - PAGE_MARGIN_LEFT_RIGHT * 2;

function stripHtmlAnchors(text) {
    return String(text || '').replace(/\s*<a\s+id="[^"]+"\s*><\/a>\s*/gi, '').trim();
}

function stripMarkdownLinks(text) {
    return stripHtmlAnchors(String(text || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'));
}

function extractInlineAnchor(text) {
    const match = String(text || '').match(/<a\s+id="([^"]+)"\s*><\/a>/i);
    return match ? match[1] : null;
}

function toWordAnchorId(anchor) {
    return String(anchor || '')
        .replace(/^#/, '')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .replace(/^[^A-Za-z_]+/, 'a_');
}

function parseInlineRuns(text) {
    const cleaned = stripHtmlAnchors(text || '');
    const runs = [];
    const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(cleaned)) !== null) {
        if (match.index > lastIndex) {
            runs.push({
                text: cleaned.slice(lastIndex, match.index),
                bold: false,
                color: '000000'
            });
        }

        if (match[2] !== undefined && match[3] !== undefined) {
            const label = match[2];
            const target = match[3];

            if (target.startsWith('#')) {
                runs.push(
                    new InternalHyperlink({
                        anchor: toWordAnchorId(target),
                        children: [
                            new TextRun({
                                text: label,
                                color: '0563C1',
                                underline: {},
                                font: 'Arial',
                                size: 24
                            })
                        ]
                    })
                );
            } else {
                runs.push({
                    text: label,
                    bold: false,
                    color: '000000'
                });
            }
        } else {
            runs.push({
                text: match[4],
                bold: true,
                color: 'CC0000'
            });
        }
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < cleaned.length) {
        runs.push({
            text: cleaned.slice(lastIndex),
            bold: false,
            color: '000000'
        });
    }

    if (runs.length === 0) {
        runs.push({ text: cleaned, bold: false, color: '000000' });
    }

    return runs.map(run => {
        if (run instanceof InternalHyperlink) {
            return run;
        }

        return new TextRun({
            text: run.text,
            bold: run.bold,
            color: run.color,
            font: 'Arial',
            size: 24
        });
    });
}

function splitTableLine(line) {
    let content = line.trim();
    if (content.startsWith('|')) content = content.slice(1);
    if (content.endsWith('|')) content = content.slice(0, -1);
    return content.split('|').map(cell => cell.trim());
}

function isTableSeparator(line) {
    const cells = splitTableLine(line);
    return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdown(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
            i += 1;
            continue;
        }

        if (trimmed.startsWith('```')) {
            const language = trimmed.slice(3).trim() || '';
            i += 1;
            const codeLines = [];
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length) i += 1;
            blocks.push({ type: 'code', language, text: codeLines.join('\n') });
            continue;
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            blocks.push({
                type: 'heading',
                level: headingMatch[1].length,
                text: stripHtmlAnchors(headingMatch[2].trim()),
                anchor: extractInlineAnchor(headingMatch[2].trim())
            });
            i += 1;
            continue;
        }

        if (/^\|.+\|$/.test(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            const tableLines = [trimmed];
            i += 2;
            while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
                tableLines.push(lines[i].trim());
                i += 1;
            }
            const headers = splitTableLine(tableLines[0]);
            const rows = tableLines.slice(1).map(splitTableLine);
            blocks.push({ type: 'table', headers, rows });
            continue;
        }

        if (/^- /.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^- /.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^- /, '').trim());
                i += 1;
            }
            blocks.push({ type: 'bullet-list', items });
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^\d+\.\s+/, '').trim());
                i += 1;
            }
            blocks.push({ type: 'number-list', items });
            continue;
        }

        const paragraphLines = [trimmed];
        i += 1;
        while (i < lines.length) {
            const next = lines[i].trim();
            if (
                !next ||
                next.startsWith('```') ||
                next.startsWith('#') ||
                next.startsWith('|') ||
                next.startsWith('- ') ||
                /^\d+\.\s+/.test(next)
            ) {
                break;
            }
            paragraphLines.push(next);
            i += 1;
        }
        blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
    }

    return blocks;
}

function inlineExternalAppendixBlocks(markdownContent, baseDir) {
    if (!baseDir) return markdownContent;

    return String(markdownContent || '').replace(
        /<!--\s*AWR_APPENDIX_BEGIN:\s*([^\n]+?)\s*-->\s*[\s\S]*?<!--\s*AWR_APPENDIX_END\s*-->/g,
        (match, appendixFileName) => {
            const resolvedPath = path.resolve(baseDir, String(appendixFileName || '').trim());
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Appendix markdown file does not exist: ${resolvedPath}`);
            }
            return fs.readFileSync(resolvedPath, 'utf8').trim();
        }
    );
}

function extractDocumentTitle(markdown) {
    const blocks = parseMarkdown(markdown);
    const titleBlock = blocks.find(block => block.type === 'heading' && block.level === 1);
    return stripMarkdownLinks(titleBlock?.text || 'AWR Report');
}

function createBorders() {
    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    return { top: border, bottom: border, left: border, right: border };
}

function createTable(headers, rows) {
    const columnCount = Math.max(headers.length, ...(rows.map(row => row.length)), 1);
    const normalizedHeaders = headers.slice();
    while (normalizedHeaders.length < columnCount) normalizedHeaders.push('');

    const widthPerColumn = Math.floor(CONTENT_WIDTH / columnCount);
    const columnWidths = Array.from({ length: columnCount }, (_, index) =>
        index === columnCount - 1
            ? CONTENT_WIDTH - widthPerColumn * (columnCount - 1)
            : widthPerColumn
    );
    const margins = { top: 80, bottom: 80, left: 100, right: 100 };

    return new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths,
        rows: [
            new TableRow({
                children: normalizedHeaders.map((header, index) =>
                    new TableCell({
                        width: { size: columnWidths[index], type: WidthType.DXA },
                        borders: createBorders(),
                        shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
                        margins,
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: header, bold: true, font: 'Arial', size: 22 })]
                            })
                        ]
                    })
                )
            }),
            ...rows.map((row, rowIndex) =>
                new TableRow({
                    children: columnWidths.map((width, columnIndex) =>
                        new TableCell({
                            width: { size: width, type: WidthType.DXA },
                            borders: createBorders(),
                            shading: {
                                fill: rowIndex % 2 === 0 ? 'FFFFFF' : 'F5F5F5',
                                type: ShadingType.CLEAR
                            },
                            margins,
                            children: [
                                new Paragraph({
                                    children: parseInlineRuns(row[columnIndex] || '')
                                })
                            ]
                        })
                    )
                })
            )
        ]
    });
}

function createCodeParagraph(line) {
    return new Paragraph({
        spacing: { after: 40 },
        children: [
            new TextRun({
                text: line,
                font: 'Consolas',
                size: 20,
                color: '333333'
            })
        ]
    });
}

function buildChildrenFromMarkdown(markdown) {
    const blocks = parseMarkdown(markdown);
    const children = [];

    for (const block of blocks) {
        switch (block.type) {
            case 'heading': {
                const headingMap = {
                    1: HeadingLevel.HEADING_1,
                    2: HeadingLevel.HEADING_2,
                    3: HeadingLevel.HEADING_3
                };
                const headingChildren = parseInlineRuns(block.text);
                const childrenWithBookmark = block.anchor
                    ? [new Bookmark({ id: toWordAnchorId(block.anchor), children: headingChildren })]
                    : headingChildren;
                children.push(
                    new Paragraph({
                        heading: headingMap[block.level] || HeadingLevel.HEADING_3,
                        spacing: { after: 120 },
                        children: childrenWithBookmark
                    })
                );
                break;
            }
            case 'paragraph':
                children.push(
                    new Paragraph({
                        spacing: { after: 100 },
                        children: parseInlineRuns(block.text)
                    })
                );
                break;
            case 'bullet-list':
                for (const item of block.items) {
                    children.push(
                        new Paragraph({
                            numbering: { reference: 'bullet-list', level: 0 },
                            spacing: { after: 60 },
                            children: parseInlineRuns(item)
                        })
                    );
                }
                break;
            case 'number-list':
                for (const item of block.items) {
                    children.push(
                        new Paragraph({
                            numbering: { reference: 'number-list', level: 0 },
                            spacing: { after: 60 },
                            children: parseInlineRuns(item)
                        })
                    );
                }
                break;
            case 'table':
                children.push(createTable(block.headers, block.rows));
                children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
                break;
            case 'code': {
                const lines = block.text.split('\n');
                if (block.language) {
                    children.push(
                        new Paragraph({
                            spacing: { after: 60 },
                            children: [
                                new TextRun({
                                    text: block.language,
                                    bold: true,
                                    color: '666666',
                                    font: 'Arial',
                                    size: 20
                                })
                            ]
                        })
                    );
                }
                for (const line of lines) {
                    children.push(createCodeParagraph(line));
                }
                children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
                break;
            }
            default:
                break;
        }
    }

    return children;
}

async function renderMarkdownToDocx(markdownContent, outputPath) {
    const children = buildChildrenFromMarkdown(markdownContent);
    const documentTitle = extractDocumentTitle(markdownContent);

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: 'Arial', size: 24 }
                }
            },
            paragraphStyles: [
                {
                    id: 'Heading1',
                    name: 'Heading 1',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: { size: 32, bold: true, font: 'Arial' },
                    paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 0 }
                },
                {
                    id: 'Heading2',
                    name: 'Heading 2',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: { size: 28, bold: true, font: 'Arial' },
                    paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 }
                },
                {
                    id: 'Heading3',
                    name: 'Heading 3',
                    basedOn: 'Normal',
                    next: 'Normal',
                    quickFormat: true,
                    run: { size: 24, bold: true, font: 'Arial' },
                    paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 2 }
                }
            ]
        },
        numbering: {
            config: [
                {
                    reference: 'bullet-list',
                    levels: [
                        {
                            level: 0,
                            format: LevelFormat.BULLET,
                            text: '•',
                            alignment: AlignmentType.LEFT,
                            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                        }
                    ]
                },
                {
                    reference: 'number-list',
                    levels: [
                        {
                            level: 0,
                            format: LevelFormat.DECIMAL,
                            text: '%1.',
                            alignment: AlignmentType.LEFT,
                            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
                        }
                    ]
                }
            ]
        },
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            width: PAGE_WIDTH_A4,
                            height: PAGE_HEIGHT_A4
                        },
                        margin: {
                            top: PAGE_MARGIN_TOP_BOTTOM,
                            right: PAGE_MARGIN_LEFT_RIGHT,
                            bottom: PAGE_MARGIN_TOP_BOTTOM,
                            left: PAGE_MARGIN_LEFT_RIGHT
                        }
                    }
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        text: documentTitle,
                                        font: 'Arial',
                                        size: 20,
                                        bold: true
                                    })
                                ]
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 20 })
                                ]
                            })
                        ]
                    })
                },
                children
            }
        ]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
}

async function renderMarkdownFileToDocx(markdownPath, outputPath) {
    const markdownContent = inlineExternalAppendixBlocks(
        fs.readFileSync(markdownPath, 'utf8'),
        path.dirname(markdownPath)
    );
    return renderMarkdownToDocx(markdownContent, outputPath);
}

module.exports = {
    parseMarkdown,
    renderMarkdownToDocx,
    renderMarkdownFileToDocx
};
