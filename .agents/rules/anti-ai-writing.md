---
trigger: always_on
description: Mandatory anti-AI writing standards for all UI copy, website content, documentation, code comments, and messages based on Wikipedia:Signs_of_AI_writing.
---

## Anti-AI Writing & Natural Human Content Rules

When generating, writing, or updating ANY text across this repository—including UI copy, buttons, toasts, modals, web pages, documentation, markdown files, commit messages, PR descriptions, and code comments:

1. **Follow the `anti-ai-writing` Skill**: Consult [.agents/skills/anti-ai-writing/SKILL.md](file:///.agents/skills/anti-ai-writing/SKILL.md), [.agents/skills/anti-ai-writing/VOCABULARY.md](file:///.agents/skills/anti-ai-writing/VOCABULARY.md), and [.agents/skills/anti-ai-writing/EXAMPLES.md](file:///.agents/skills/anti-ai-writing/EXAMPLES.md).
2. **Zero Banned Words & Clichés**: Never use dead giveaway AI vocabulary:
   - English: *delve, tapestry, testament to, pivotal, paramount, foster, multifaceted, vibrant, enduring, landscape, crucial, underscore, intricate, interplay, bolster, garner, meticulous, align with, enhance, showcasing, burgeoning, poised to, seamless, revolutionize, cutting-edge, game-changer.*
   - Vietnamese: *minh chứng cho, bức tranh toàn cảnh, đóng vai trò then chốt, thúc đẩy, sâu sắc, cảnh quan (nghĩa bóng), không ngừng phát triển, mang tính cách mạng, giải pháp đột phá, liền mạch, nâng tầm, mở ra kỷ nguyên mới.*
3. **No Trailing Participial Commentary**: Do not glue present participle (`-ing`) commentary clauses onto sentences (e.g. `..., highlighting its commitment and fostering greater collaboration` or `..., qua đó khẳng định vị thế`). State the direct factual action.
4. **Use Direct, Simple Copulas**: Write simple "X is Y" / "X là Y". Do not avoid "is/are" with stilted phrases like "serves as", "stands as", "functions as", "đóng vai trò là", "hiện diện như một".
5. **No Negative Parallelisms or Forced Tricolons**:
   - Avoid "Not only X, but also Y", "Not merely X, but Y", "Y rather than X" ("Không chỉ X mà còn Y", "Không đơn thuần là X mà là Y").
   - Do not force lists of three adjectives or virtues ("fast, reliable, and scalable"). State only what is necessary and true.
6. **No Structural & Markdown Slop**:
   - Do not format every bullet mechanically with `* **Bold Title**: Explanation`. Mix paragraphs, compact tables, and natural bullet points.
   - Do not use emojis as bullet points or decor (`🚀`, `💡`, `✨`, `🌟`, `📌`, `🔥`) in documentation or UI.
   - Do not capitalize every word in headings (use sentence case).
   - Do not append canned "Challenges and Outlook" or "Conclusion" paragraphs. Stop writing when the information ends.
   - Eliminate chatbot chatter ("Certainly!", "Here is a breakdown...", "I hope this helps!").
7. **Pragmatic, Active UI Copy**:
   - Buttons: direct verbs ("Lưu", "Đăng tin", "Tải CV", "Xóa").
   - Errors: state what happened and the direct resolution, without groveling apologies ("Không thể kết nối đến máy chủ. Vui lòng thử lại.").
   - Empty states: direct instruction and action ("Chưa có ứng viên nào ứng tuyển. [Xem lại tin đăng]").
