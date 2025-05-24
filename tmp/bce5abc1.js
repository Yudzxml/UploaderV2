case 'werewolf':
case 'join':
case 'kill':
case 'heal':
case 'cek':
case 'next': {
  const gameSessions = global.gameSessions ||= {};

  async function werewolfGame({ m, Yudzxml, command, args }) {
    const chatId = m.chat;
    const sender = m.sender;
    const senderName = sender.split('@')[0];

    // === MEMULAI GAME ===
    if (command === 'werewolf') {
      if (gameSessions[chatId]) return await Yudzxml.sendMessage(chatId, { text: 'Game sedang berlangsung.' });

      gameSessions[chatId] = {
        players: [{ id: sender, name: senderName }],
        status: 'waiting',
        round: 0,
        actions: {},
        log: [],
        timeout: null
      };

      await Yudzxml.sendMessage(chatId, {
        text: `Werewolf Game dimulai oleh *${senderName}*!\nKetik *join* untuk ikut.\nMenunggu pemain lain selama *30 detik*...`
      });

      // Tunggu pemain lain selama 30 detik
      gameSessions[chatId].timeout = setTimeout(async () => {
        const session = gameSessions[chatId];
        if (session.players.length < 5) {
          delete gameSessions[chatId];
          await Yudzxml.sendMessage(chatId, { text: 'Tidak cukup pemain. Game dibatalkan.' });
        } else {
          await startGame(session, Yudzxml, chatId);
        }
      }, 30000);

      return;
    }

    const session = gameSessions[chatId];
    if (!session) return;

    // === JOIN GAME ===
    if (command === 'join') {
      if (session.status !== 'waiting') return;
      if (session.players.find(p => p.id === sender)) return;

      session.players.push({ id: sender, name: senderName });
      await Yudzxml.sendMessage(chatId, {
        text: `*${senderName}* bergabung! (${session.players.length}/5)`
      });

      if (session.players.length === 5) {
        clearTimeout(session.timeout);
        await startGame(session, Yudzxml, chatId);
      }
      return;
    }

    // === AKSI ROLE ===
    if (['kill', 'heal', 'cek'].includes(command)) {
      await handleRoleAction({ m, command, args, session, Yudzxml });
      return;
    }

    // === NEXT ROUND ===
    if (command === 'next') {
      await advanceGame(session, Yudzxml, chatId);
      return;
    }
  }

  // === BAGI ROLE & KIRIM PRIVAT ===
  async function startGame(session, sock, chatId) {
    const roles = ['werewolf', 'doctor', 'police', 'warga', 'warga'];
    session.players = session.players.sort(() => Math.random() - 0.5);

    session.players.forEach((p, i) => {
      p.role = roles[i];
      p.alive = true;

      const msg = {
        werewolf: 'Kamu *WEREWOLF*. Gunakan *kill [id]* di privchat untuk membunuh.',
        doctor: 'Kamu *DOKTER*. Gunakan *heal [id]* di privchat untuk menyelamatkan.',
        police: 'Kamu *POLISI*. Gunakan *cek [id]* di privchat untuk menyelidiki.',
        warga: 'Kamu *WARGA*. Bertahanlah dan bantu voting saat siang.'
      }[p.role];

      sock.sendMessage(p.id, { text: msg });
    });

    session.status = 'night';
    session.round = 1;
    session.actions = { werewolf: null, doctor: null, police: null };
    session.log.push('Game dimulai. Malam pertama tiba.');

    await sock.sendMessage(chatId, { text: 'Semua role telah dibagikan lewat privchat. Malam tiba.' });
  }

  // === PROSES AKSI ROLE ===
  async function handleRoleAction({ m, command, args, session, Yudzxml }) {
    const sender = m.sender;
    const player = session.players.find(p => p.id === sender);
    if (!player || !player.alive) return;

    const targetId = args[0];
    const target = session.players.find(p => p.id === targetId);
    if (!target || !target.alive) {
      return await Yudzxml.sendMessage(sender, { text: 'Target tidak valid atau sudah mati.' });
    }

    // Validasi peran dan aksi
    if (command === 'kill') {
      if (player.role !== 'werewolf') return await Yudzxml.sendMessage(sender, { text: 'Kamu bukan werewolf!' });
      session.actions.werewolf = targetId;
      await Yudzxml.sendMessage(sender, { text: `Kamu memilih membunuh *${target.name}*` });
    }

    if (command === 'heal') {
      if (player.role !== 'doctor') return await Yudzxml.sendMessage(sender, { text: 'Kamu bukan dokter!' });
      session.actions.doctor = targetId;
      await Yudzxml.sendMessage(sender, { text: `Kamu memilih menyelamatkan *${target.name}*` });
    }

    if (command === 'cek') {
      if (player.role !== 'police') return await Yudzxml.sendMessage(sender, { text: 'Kamu bukan polisi!' });
      const result = target.role === 'werewolf' ? 'werewolf' : 'bukan werewolf';
      await Yudzxml.sendMessage(sender, {
        text: `Hasil investigasi: *${target.name}* adalah *${result}*`
      });
    }
  }

  // === PROSES NEXT RONDE ===
  async function advanceGame(session, sock, chatId) {
    if (session.status === 'night') {
      const { werewolf, doctor } = session.actions;
      let killed = null;

      if (werewolf && werewolf !== doctor) {
        const target = session.players.find(p => p.id === werewolf && p.alive);
        if (target) {
          target.alive = false;
          killed = target.name;
        }
      }

      session.log.push(killed ? `${killed} terbunuh.` : 'Tidak ada korban.');
      session.status = 'day';
      session.actions = { werewolf: null, doctor: null, police: null };

      await sock.sendMessage(chatId, {
        text: killed
          ? `Pagi datang... *${killed}* ditemukan meninggal.`
          : 'Pagi datang... Semua selamat!'
      });
    }
  }

  // Jalankan game handler
  await werewolfGame({ m, Yudzxml, command, args });
}
break