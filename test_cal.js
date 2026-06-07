fetch('https://api.allorigins.win/raw?url=https://superflixapi.fit/calendario.php')
  .then(r => r.json())
  .then(data => console.log('cal raw length:', data.length))
  .catch(e => console.log('err', e));
