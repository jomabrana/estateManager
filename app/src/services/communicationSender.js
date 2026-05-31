const { sendEmail } = require("../utils/mailer");

async function sendCommunication(comm) {
  const channel = (comm.channel || comm.type || "").toUpperCase();

  if (channel === "EMAIL") {
    await sendEmail({
      to: comm.recipient,
      subject: comm.subject || "Message from EstatePro",
      text: comm.content
    });
    return;
  }

  throw new Error(`Unsupported channel: ${channel}`);
}

module.exports = {
  sendCommunication
};

