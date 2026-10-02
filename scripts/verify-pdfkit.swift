// Run on macOS: swift scripts/verify-pdfkit.swift test-fixtures/pdf
// Parser integration check. It does not replace iOS app/bridge/device validation.
import Foundation
import PDFKit
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "test-fixtures/pdf")
func open(_ name: String) -> PDFDocument {
  guard let document = PDFDocument(url: root.appendingPathComponent(name)) else { fatalError("Cannot open \(name)") }
  return document
}
let text = open("text.pdf")
assert(text.pageCount == 2)
assert(text.page(at: 0)!.string!.contains("Photosynthesis"))
assert(!text.page(at: 0)!.string!.contains("marigold"))
assert(text.page(at: 1)!.string!.contains("marigold"))
let columns = open("columns.pdf").page(at: 0)!.string!
assert(columns.contains("LEFT column sentence 12"))
assert(columns.contains("RIGHT column sentence 12"))
let large = open("large.pdf")
assert(large.pageCount == 300)
assert(large.page(at: 299)!.string!.contains("PAGE_300"))
assert(open("page-limit.pdf").pageCount == 301)
assert((open("scanned.pdf").page(at: 0)!.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
assert(open("mixed.pdf").page(at: 1)!.string!.contains("coriander"))
assert(open("locked.pdf").isEncrypted)
assert(PDFDocument(url: root.appendingPathComponent("corrupt.pdf")) == nil)
print("PDFKit fixture checks passed. Run the iOS app checks in docs/PDF_RAG.md next.")
