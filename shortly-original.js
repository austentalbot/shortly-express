var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();
app.use(express.cookieParser('shhhh, very secret'));
app.use(express.session());

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
});

//create hashing function
var hasher=function(pw) {
  var hashWord=bcrypt.hashSync(pw);
  console.log(hashWord);
  return hashWord;
};


//create function to restrict access to certain pages
var checkUser = function(req, res, next) {
  if (req.session.username) {
    next();
  } else {
    console.log('You must log in to see this page');
    req.session.error = 'You must log in to see this page';
    res.redirect('/login');
  }
};

//restrict version
app.get('/', checkUser, function(req, res) {
  res.render('index');
});

app.get('/create', checkUser, function(req, res) {
  res.render('index');
});

app.get('/links', checkUser, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

//app.get login
app.get('/login', function(req, res){
  console.log('Getting login');
  res.render('login');
});
//app.post login
app.post('/login', function(req, res){
  console.log('Posting to login');
  var username = req.body.username;
  var password = req.body.password;
  console.log(username, password);

  db.knex('users').where({username: username})
  .select()
  .then(function(results) {
    if (results[0]!==undefined) {
      var user=results[0];
      //var hashWord=hasher(password);

      if (bcrypt.compareSync(password, user.password)) {
        console.log('success');
        req.session.regenerate(function() {
          req.session.username=username;
          res.redirect('index');
        });
      } else{
        console.log('FAILURE');
        res.redirect('login');
      }
    } else {
      console.log('USERNAME NOT FOUND');
      res.redirect('login');
    }

  });
  // db.knex('urls').select().then(function() {
  //   console.log(arguments);
  // });

});
//app.get signup
app.get('/signup', function(req, res){
  console.log('Getting signup');
  res.render('signup');
});

//app.post signup
app.post('/signup', function(req, res){
  console.log('Posting to signup');
  //Pass in form values, of username and password (see above)
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch().then(function(found) {
    if (found) {
      console.log('Username already taken');
      return res.redirect('signup');
    } else {
      var user = new User({
        username: username,
        password: hasher(password),
      });
      user.save().then(function(newUser) {
        Users.add(newUser);
        res.redirect('login');
      });
    }
  });
});

app.get('/logout', function(req, res){
  req.session.destroy(function() {
    res.redirect('login');
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
