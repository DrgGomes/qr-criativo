import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // Se faltar configuração, não quebra: leva para página de erro amigável
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(302).redirect('/?error=not-found');
  }

  const slug = (req.query.slug || '').toString().trim();

  if (!slug) {
    return res.status(302).redirect('/?error=not-found');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: qrcode, error } = await supabase
      .from('qrcodes')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !qrcode) {
      return res.status(302).redirect('/?error=not-found');
    }

    if (!qrcode.is_active) {
      return res.status(302).redirect('/?error=inactive');
    }

    // Registra o scan sem travar o redirecionamento
    try {
      const userAgent = req.headers['user-agent'] || '';
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || '0.0.0.0';
      const referer = req.headers['referer'] || '';

      let deviceType = 'desktop';
      let browser = 'unknown';
      let os = 'unknown';

      if (userAgent) {
        const ua = userAgent.toLowerCase();
        if (/mobile|android|iphone|ipad|tablet/i.test(ua)) {
          deviceType = /tablet|ipad/i.test(ua) ? 'tablet' : 'mobile';
        }
        if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
        else if (/firefox/i.test(ua)) browser = 'Firefox';
        else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
        else if (/edge|edg/i.test(ua)) browser = 'Edge';

        if (/windows/i.test(ua)) os = 'Windows';
        else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad/i.test(ua)) os = 'iOS';
        else if (/linux/i.test(ua)) os = 'Linux';
      }

      let country = 'Desconhecido';
      let city = '';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
        clearTimeout(timeout);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          country = geo.country_name || 'Desconhecido';
          city = geo.city || '';
        }
      } catch (e) { /* sem geolocalização, segue o fluxo */ }

      await supabase.from('scan_events').insert({
        qrcode_id: qrcode.id,
        ip_address: ip,
        user_agent: userAgent,
        referer: referer,
        country: country,
        city: city,
        device_type: deviceType,
        browser: browser,
        os: os
      });

      await supabase.rpc('increment_scans', { qrcode_id: qrcode.id });
    } catch (e) { /* scan é bônus, nunca bloqueia o redirect */ }

    return res.status(302).redirect(qrcode.destination);

  } catch (e) {
    // Última rede de segurança: nunca mostra 500 para quem escaneia
    return res.status(302).redirect('/?error=not-found');
  }
}
