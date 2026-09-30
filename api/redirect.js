import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const slug = req.query.slug;

  if (!slug) {
    return res.status(400).json({ error: 'Slug não informado' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: qrcode, error } = await supabase
    .from('qrcodes')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !qrcode) {
    return res.status(302).redirect('/?error=not-found');
  }

  if (!qrcode.is_active) {
    return res.status(302).redirect('/?error=inactive');
  }

  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '0.0.0.0';
  const referer = req.headers['referer'] || '';

  let deviceType = 'desktop';
  let browser = 'unknown';
  let os = 'unknown';

  if (userAgent) {
    if (/mobile|android|iphone|ipad|tablet/i.test(userAgent)) {
      deviceType = /tablet|ipad/i.test(userAgent) ? 'tablet' : 'mobile';
    }
    if (/chrome|crios/i.test(userAgent) && !/edg/i.test(userAgent)) browser = 'Chrome';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
    else if (/edge|edg/i.test(userAgent)) browser = 'Edge';

    if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/macintosh|mac os/i.test(userAgent)) os = 'macOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/iphone|ipad/i.test(userAgent)) os = 'iOS';
  }

  let country = 'Desconhecido';
  let city = '';
  try {
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`);
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

  res.status(302).redirect(qrcode.destination);
}
