import { Resend } from "resend";
import { z } from "zod";
import { zfd } from "zod-form-data";

const formSchema = zfd.formData({
	role: zfd.text(z.string().min(1, "Role is required")),
	motivation: zfd.text(z.string().min(1, "Motivation is required")),
	projects: zfd.text(
		z.string().min(1, "Please list some projects you've worked on before"),
	),
	message: zfd.text(
		z
			.string()
			.min(1, "Please provide reasons why you are a good fit for this role"),
	),
	cv: zfd
		.file()
		.refine(
			(file) => file.size <= 2 * 1024 * 1024,
			"File size must be less than 2MB",
		)
		.refine(
			(file) => file.type === "application/pdf",
			"Only PDF files are allowed",
		),
});

type EmailData = Omit<z.infer<typeof formSchema>, "cv">;

const createEmailTemplate = (data: EmailData) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f4f4f4; padding: 10px; text-align: center; }
        .content { margin: 20px 0; }
        .footer { margin-top: 20px; font-size: 0.8em; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Application Received</h1>
        </div>
        <div class="content">
            <p><strong>Role:</strong> ${data.role}</p>
            <p><strong>Motivation:</strong> ${data.motivation}</p>
            <p><strong>Projects:</strong> ${data.projects}</p>
            <p><strong>Message:</strong></p>
            <p>${data.message}</p>
        </div>
        <div class="footer">
            <p>This email was sent from your virgasapp recruitment form.</p>
        </div>
    </div>
</body>
</html>
`;

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

export default {
	async fetch(request, env) {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders,
			});
		}

		if (request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		try {
			const formData = await request.formData();
			const result = formSchema.safeParse(formData);

			if (!result.success) {
				const errors = result.error.flatten();
				return new Response(JSON.stringify({ success: false, errors }), {
					status: 400,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				});
			}

			const { role, projects, motivation, message, cv } = result.data;

			const resend = new Resend(env.RESEND_API_KEY);

			const fileBuffer = await cv.arrayBuffer();
			const fileBase64 = Buffer.from(fileBuffer).toString("base64");
			const { error } = await resend.emails.send({
				from: `Virgas Hiring ${env.RESEND_EMAIL}`,
				to: env.VIRGAS_EMAIL,
				subject: `New Virgas Job Application`,
				html: createEmailTemplate({ role, projects, motivation, message }),
				attachments: [
					{
						filename: cv.name,
						content: fileBase64,
					},
				],
			});

			if (error) {
				console.error("Error sending email:", error);
				return new Response(
					JSON.stringify({
						success: false,
						error: "Failed to send email, please try again later.",
					}),
					{
						status: 500,
						headers: { "Content-Type": "application/json", ...corsHeaders },
					},
				);
			}

			return new Response(
				JSON.stringify({ success: true, message: "Email sent successfully." }),
				{
					status: 200,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				},
			);
		} catch (err) {
			console.error("Error processing request:", err);
			return new Response(
				JSON.stringify({
					success: false,
					error: "Failed to send email, please try again later.",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json", ...corsHeaders },
				},
			);
		}
	},
} satisfies ExportedHandler<Env>;
