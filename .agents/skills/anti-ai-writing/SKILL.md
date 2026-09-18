---
name: anti-ai-writing
description: Strict guidelines and anti-patterns derived from Wikipedia:Signs_of_AI_writing. Enforces natural, authentic, grounded human-like writing across UI copy, web content, documentation, and code comments by eliminating AI clichés, synthetic rhythm, structural slop, and promotional puffery.
---

# Anti-AI Writing & Natural Content Standards

This skill operationalizes the empirical findings from [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) into strict development, UI/UX copywriting, and technical documentation rules.

All agents working in this repository MUST adhere to these guidelines to ensure that all website text, user interfaces, documentation, release notes, and code comments read like authentic, pragmatic human engineering—completely devoid of "AI slop" or synthetic prose.

---

## 1. Core Philosophy: The Human Writing Baseline

Large Language Models (LLMs) operate by statistical regression to the mean: they smooth out concrete, unusual, domain-specific facts and replace them with generic, important-sounding abstractions.

**The Golden Rules of Human Writing:**
1. **Be Radically Specific**: Replace vague praise with concrete data, exact behaviors, and literal capabilities.
2. **Embrace Natural Burstiness**: Humans vary sentence length naturally. Mix punchy 3-word sentences with longer technical explanations. Avoid uniform paragraph cadences.
3. **Use Simple Copulas**: Say "X là Y" or "X is Y". Never use flowery circumlocutions like "serves as", "stands as", or "đóng vai trò là một minh chứng".
4. **Stop When Finished**: When the explanation or instruction ends, stop writing. Never append a generic summary, philosophical reflection, or future outlook.
5. **No Synthetic Cheerleading**: Interfaces and docs exist to inform and guide, not to sell or flatter.

---

## 2. The 8 Critical AI Anti-Patterns (Wikipedia Tells)

### Anti-Pattern 1: High-Density AI Vocabulary (Banned Words)
LLMs exhibit severe lexical fixation on a recurring set of words that real humans rarely use in practical engineering or documentation.

- **Banned English Words**: *delve, tapestry (rich tapestry), testament (testament to), beacon, pivotal, paramount, foster, multifaceted, vibrant, enduring, landscape, crucial, underscore, intricate, interplay, bolster, garner, meticulous, align with, enhance, showcasing, burgeoning, poised to, seamless, revolutionize, cutting-edge, game-changer.*
- **Banned Vietnamese Clichés**: *minh chứng cho, bức tranh toàn cảnh, đóng vai trò then chốt, thúc đẩy, sâu sắc, phong phú, cảnh quan (nghĩa bóng), tinh tế, đan xen, không ngừng phát triển, mang tính cách mạng, giải pháp đột phá, liền mạch, nâng tầm, mở ra kỷ nguyên mới.*
*(See [VOCABULARY.md](file:///.agents/skills/anti-ai-writing/VOCABULARY.md) for full blacklist and human replacements).*

### Anti-Pattern 2: Puffed-Up Significance & Bogus Legacy
AI loves to inflate ordinary features, etymologies, or mundane facts into world-changing milestones.
- ❌ *AI Slop*: "The establishment of the Admin Dashboard marks a pivotal moment in TalentPulse's evolution, underscoring its enduring commitment to empowering recruiters."
- ✅ *Human Plaintext*: "The Admin Dashboard provides user management, package pricing controls, and revenue reporting."

### Anti-Pattern 3: Superficial Analyses with Trailing `-ing` Participle Clauses
A ubiquitous tell of AI writing is gluing present participle (`-ing`) clauses to the end of sentences to add fake depth or commentary.
- ❌ *AI Slop*: "...creating a unified experience, highlighting the platform's reliability and fostering greater collaboration."
- ❌ *AI Slop (VN)*: "...giúp tối ưu quy trình, qua đó khẳng định vị thế dẫn đầu và làm nổi bật tính chuyên nghiệp."
- ✅ *Human Plaintext*: "...saving recruiter inputs directly to PostgreSQL and sending an email receipt via Bull queue."

### Anti-Pattern 4: Avoidance of Basic Copulatives ("is" / "are")
LLMs act as if the verbs "is" and "are" (hoặc từ "là") are too mundane, compulsively substituting them with stilted pseudo-literary alternatives:
- ❌ *Avoid*: "serves as", "stands as", "acts as", "functions as", "emerges as", "đóng vai trò như", "hiện diện như một".
- ✅ *Use*: Simple "is", "are", "has", "là", "có".
  - ❌ *AI*: "The Premium package serves as the flagship offering for enterprise recruiters."
  - ✅ *Human*: "The Premium package gives recruiters 10 hot job slots and unlimited CV search."

### Anti-Pattern 5: Negative Parallelisms ("Not only X, but also Y")
LLMs rely heavily on formulaic contrasting clauses:
- ❌ *Formula 1*: "Not just X, but also Y" / "Không chỉ X mà còn Y"
- ❌ *Formula 2*: "It is not merely a tool, but a symbol of..." / "Không đơn thuần là X, mà là..."
- ❌ *Formula 3*: "Y rather than X" / "X thay vì Y"
- ✅ *Fix*: State the positive reality directly without setting up rhetorical contrast.

### Anti-Pattern 6: Obsessive Rule of Three (Tricolons)
LLMs compulsively group adjectives, nouns, or bullet points in triplets:
- ❌ *AI Slop*: "Our platform is intuitive, efficient, and scalable."
- ❌ *AI Slop*: "...fostering growth, inspiring change, and shaping the future."
- ✅ *Fix*: Say what actually matters. If a tool is fast, say it's fast (e.g. "Response time under 50ms"). Don't invent two filler adjectives to make a triplet.

### Anti-Pattern 7: Canned "Challenges and Future Prospects" Outlines
AI essays and generated sections follow a predictable formula at the end:
- ❌ *AI Slop*: "Despite its impressive capabilities, the system faces challenges typical of distributed architectures. Looking ahead, the future of TalentPulse lies in adapting to emerging trends as technology continues to evolve."
- ✅ *Fix*: Omit entirely. End documentation with the actual technical reference or configuration steps.

### Anti-Pattern 8: Structural & Markdown Ticks
- **No Inline-Header Vertical Lists**: Avoid the rigid pattern where every single bullet point is mechanically structured as `* **Bold Title**: Explanation paragraph.` Mix prose paragraphs, compact tables, and simple bullet points.
- **No Title Case in Headings**: Do not capitalize every single word in headings. Use standard sentence case ("System configuration and installation", not "System Configuration And Installation").
- **No Emoji Bullet Formatting**: Do not prefix technical bullets or UI lists with emojis (`🚀`, `💡`, `✨`, `🌟`, `📌`, `🔥`). Use standard clean markdown or vector SVG icons in UI.
- **No Chatbot Meta-Talk**: Eliminate conversational pleasantries ("Certainly!", "Here is the plan...", "I hope this helps!", "In summary,...").
- **No Decorative Em-Dashes**: Avoid scattering spaces-padded em dashes (` — `) for dramatic pauses.

---

## 3. Application Rules for UI Copy & Web Content

When writing text displayed on the website or mobile app (buttons, modals, toasts, tooltips, landing pages, error messages):

| UI Element | ❌ AI Slop to Avoid | ✅ Authentic Human Copy |
| :--- | :--- | :--- |
| **Hero Title** | "Cách mạng hóa trải nghiệm tuyển dụng với nền tảng AI đột phá" | "Tìm việc làm & Ứng viên IT chất lượng cao" |
| **Hero Subtitle** | "Khám phá bức tranh toàn cảnh về cơ hội nghề nghiệp, nơi kết nối những tài năng xuất chúng với doanh nghiệp hàng đầu" | "Hơn 5.000 tin tuyển dụng được xác minh mỗi ngày từ các công ty công nghệ tại Việt Nam." |
| **Button / CTA** | "Bắt đầu hành trình khám phá ngay hôm nay" | "Đăng tin tuyển dụng" / "Xem danh sách việc làm" |
| **Form Labels** | "Vui lòng nhập họ và tên đầy đủ của bạn vào đây:" | "Họ và tên" |
| **Success Toast** | "Thao tác đã được ghi nhận thành công vào hệ thống!" | "Đã lưu hồ sơ." |
| **Error Message** | "Rất tiếc vì sự bất tiện này. Đã có lỗi bất ngờ xảy ra trong quá trình xử lý yêu cầu của bạn." | "Không thể kết nối đến máy chủ. Vui lòng thử lại sau vài giây." |
| **Empty State** | "Không gian này hiện đang trống trải. Hãy bắt đầu kiến tạo hồ sơ để mở ra những cơ hội mới." | "Chưa có ứng viên nào ứng tuyển. [Xem lại tin đăng]" |
| **Feature Badge** | "Công nghệ tiên phong vượt trội" | "Xác thực 24h" / "HOT" / "VIP" |

---

## 4. Application Rules for Documentation & Code

1. **Code Comments**:
   - ❌ Don't write: `// Enhances the user authentication flow by meticulously validating tokens, fostering greater security.`
   - ✅ Do write: `// Reject expired JWTs or revoked refresh tokens (stored in Redis blacklist).`
2. **README & Feature Docs**:
   - Avoid marketing fluff. Document prerequisites, environment variables, commands, parameters, and return types.
   - Do not add "Conclusion", "Future Outlook", or "Key Takeaways" sections unless explicitly requested.
3. **Commit Messages & Pull Requests**:
   - Imperative, concise, descriptive: `feat(payments): add dynamic package validation and quota tracking`.
   - Never write self-congratulatory summaries: `feat(payments): revolutionized the billing architecture with an exquisite, robust, and state-of-the-art engine`.

---

## 5. Verification Checklist Before Delivering Any Content

Before submitting UI changes, documentation, or explanatory text, ask:
- [ ] Are there any words from the [Banned Vocabulary List](file:///.agents/skills/anti-ai-writing/VOCABULARY.md) (*delve*, *testament*, *tapestry*, *pivotal*, *minh chứng*, *bức tranh*, *then chốt*)?
- [ ] Did I end sentences with trailing participial commentary (`..., highlighting/underscoring/fostering...`)?
- [ ] Did I avoid simple "is" / "là" and replace it with "serves as" / "đóng vai trò là"?
- [ ] Is there an unnecessary "Not only X, but Y" or tricolon ("adjective, adjective, and adjective")?
- [ ] Are headings formatted in sentence case without decorative emojis?
- [ ] Is the tone matter-of-fact, pragmatic, and directly useful to an engineer or user?
