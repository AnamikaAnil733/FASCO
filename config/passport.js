const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy
const User = require("../models/userSchema")
const env = require("dotenv").config()


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
    try {
        // First check if user exists with Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            // If no user with Google ID, check for user with same email
            user = await User.findOne({ email: profile.emails[0].value });
            
            if (user) {
                // If user exists with email, update their Google ID
                user.googleId = profile.id;
                await user.save();
                return done(null, user);
            }
            
            // If no user exists at all, create new user
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                isVerified: true // Since Google has verified the email
            });
            await user.save();
        }
        
        return done(null, user);
    } catch (error) {
        console.error('Google Auth Error:', error);
        return done(error, null);
    }
}));


passport.serializeUser((user,done)=>{
    done(null,user)
})


passport.deserializeUser((id,done)=>{
    User.findById(id)
    .then(user=>{
        done(null,user)
    })
    .catch(err=>{
        done(err,null)
    })
})

module.exports = passport