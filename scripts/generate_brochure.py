import os
from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        # Title
        self.set_font('Helvetica', 'B', 16)
        self.cell(0, 10, 'PharmaPro – Smart Pharmacy Management', border=False, ln=1, align='C')
        self.ln(5)
    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', align='C')

def markdown_to_lines(md_path):
    with open(md_path, encoding='utf-8') as f:
        lines = f.read().splitlines()
    return lines

def add_content(pdf, lines):
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font('Helvetica', '', 12)
    for line in lines:
        # Simple handling of headings
        if line.startswith('# '):
            pdf.set_font('Helvetica', 'B', 14)
            pdf.cell(0, 10, line[2:], ln=1)
            pdf.ln(2)
            pdf.set_font('Helvetica', '', 12)
        elif line.startswith('## '):
            pdf.set_font('Helvetica', 'B', 13)
            pdf.cell(0, 9, line[3:], ln=1)
            pdf.ln(2)
            pdf.set_font('Helvetica', '', 12)
        elif line.startswith('- '):
            pdf.cell(5)  # indent
            pdf.cell(0, 8, u'• ' + line[2:], ln=1)
        elif line.strip() == '---':
            pdf.ln(2)
            pdf.set_draw_color(200,200,200)
            pdf.line(pdf.get_x(), pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(2)
        else:
            pdf.multi_cell(0, 8, line)
            pdf.ln(1)

if __name__ == '__main__':
    md_path = os.path.abspath(os.path.join('docs', 'BROCHURE.md'))
    pdf_path = os.path.abspath(os.path.join('docs', 'BROCHURE.pdf'))
    lines = markdown_to_lines(md_path)
    pdf = PDF()
    pdf.add_page()
    add_content(pdf, lines)
    pdf.output(pdf_path)
    print(f'PDF brochure generated at {pdf_path}')
