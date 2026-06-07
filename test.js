fetch('https://superflixapi.fit/lista?category=canais&format=json')
  .then(r => r.json())
  .then(data => console.log('data:', JSON.stringify(data).slice(0, 500)))
  .catch(e => console.log('canais err', e));
