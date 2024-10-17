document.addEventListener('DOMContentLoaded', function() {
    const { app, auth, database, storage } = window.firebaseApp;

    // Initialize libraries
    AOS.init();
    const notyf = new Notyf();

    // Check authentication state
    auth.onAuthStateChanged(function(user) {
        if (user) {
            // User is signed in
            loadUserContent(user);
        } else {
            // No user is signed in, redirect to login page
            window.location.href = 'index.html';
        }
    });

    // Initialize Quill editor
    const quill = new Quill('#contentDescription', {
        theme: 'snow',
        placeholder: 'Escreva uma descrição...'
    });

    // Initialize Tagify
    const tagInput = document.getElementById('contentTags');
    new Tagify(tagInput);

    // Initialize Dropzone
    Dropzone.autoDiscover = false;
    const myDropzone = new Dropzone("#dropzone", {
        url: "/file/post",
        autoProcessQueue: false,
        addRemoveLinks: true,
        maxFiles: 1
    });

    // Add Content Button
    const addContentBtn = document.getElementById('addContentBtn');
    const addContentModal = new bootstrap.Modal(document.getElementById('addContentModal'));

    addContentBtn.addEventListener('click', function() {
        addContentModal.show();
    });

    // Publish Content
    const publishContentBtn = document.getElementById('publishContent');
    publishContentBtn.addEventListener('click', function() {
        const title = document.getElementById('contentTitle').value;
        const description = quill.root.innerHTML;
        const tags = tagInput.value;
        
        if (!title || !description || myDropzone.files.length === 0) {
            notyf.error('Por favor, preencha todos os campos e adicione um arquivo.');
            return;
        }

        const file = myDropzone.files[0];
        const storageRef = storage.ref('user-content/' + auth.currentUser.uid + '/' + file.name);
        
        storageRef.put(file).then((snapshot) => {
            snapshot.ref.getDownloadURL().then((downloadURL) => {
                const newPostKey = database.ref().child('posts').push().key;
                const postData = {
                    userId: auth.currentUser.uid,
                    title: title,
                    description: description,
                    tags: tags,
                    fileUrl: downloadURL,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    likes: 0,
                    comments: {}
                };

                let updates = {};
                updates['/posts/' + newPostKey] = postData;
                updates['/user-posts/' + auth.currentUser.uid + '/' + newPostKey] = postData;

                database.ref().update(updates).then(() => {
                    notyf.success('Conteúdo publicado com sucesso!');
                    addContentModal.hide();
                    loadUserContent(auth.currentUser);
                }).catch((error) => {
                    notyf.error('Erro ao publicar conteúdo: ' + error.message);
                });
            });
        });
    });

    // Load user content
    function loadUserContent(user) {
        const feedElement = document.getElementById('feed');
        feedElement.innerHTML = '';

        database.ref('posts').orderByChild('timestamp').on('child_added', (snapshot) => {
            const post = snapshot.val();
            const postElement = createPostElement(post, snapshot.key);
            feedElement.prepend(postElement);
        });
    }

    // Create post element
    function createPostElement(post, postId) {
        const postElement = document.createElement('div');
        postElement.className = 'col-md-6 col-lg-4';
        postElement.innerHTML = `
            <div class="post-card" data-aos="fade-up">
                <div class="post-header">
                    <img src="${post.userAvatar || 'https://via.placeholder.com/40'}" alt="User Avatar" class="post-avatar">
                    <div>
                        <div class="post-username">${post.userName || 'Usuário'}</div>
                        <div class="post-time">${moment(post.timestamp).fromNow()}</div>
                    </div>
                </div>
                <div class="post-content">
                    <h5>${post.title}</h5>
                    <p>${post.description}</p>
                    ${post.fileUrl.includes('.mp4') ? 
                        `<video src="${post.fileUrl}" controls></video>` : 
                        `<img src="${post.fileUrl}" alt="Post content">`
                    }
                </div>
                <div class="post-actions">
                    <a href="#" class="post-action like-action" data-post-id="${postId}">
                        <i class="far fa-heart"></i> <span class="like-count">${post.likes || 0}</span>
                    </a>
                    <a href="#" class="post-action comment-action" data-post-id="${postId}">
                        <i class="far fa-comment"></i> Comentar
                    </a>
                    <a href="#" class="post-action report-action" data-post-id="${postId}">
                        <i class="far fa-flag"></i> Denunciar
                    </a>
                </div>
                <div class="comments-section" id="comments-${postId}"></div>
            </div>
        `;

        // Like action
        const likeAction = postElement.querySelector('.like-action');
        likeAction.addEventListener('click', (e) => {
            e.preventDefault();
            const postRef = database.ref('posts/' + postId);
            postRef.transaction((post) => {
                if (post) {
                    post.likes = (post.likes || 0) + 1;
                }
                return post;
            });
        });

        // Comment action
        const commentAction = postElement.querySelector('.comment-action');
        commentAction.addEventListener('click', (e) => {
            e.preventDefault();
            Swal.fire({
                title: 'Adicionar Comentário',
                input: 'textarea',
                inputAttributes: {
                    autocapitalize: 'off'
                },
                showCancelButton: true,
                confirmButtonText: 'Comentar',
                showLoaderOnConfirm: true,
                preConfirm: (comment) => {
                    if (!comment) {
                        Swal.showValidationMessage('Por favor, escreva um comentário');
                    }
                    return comment;
                },
                allowOutsideClick: () => !Swal.isLoading()
            }).then((result) => {
                if (result.isConfirmed) {
                    const newCommentKey = database.ref().child('posts/' + postId + '/comments').push().key;
                    const commentData = {
                        userId: auth.currentUser.uid,
                        text: result.value,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };
                    let updates = {};
                    updates['/posts/' + postId + '/comments/' + newCommentKey] = commentData;
                    database.ref().update(updates).then(() => {
                        notyf.success('Comentário adicionado com sucesso!');
                        loadComments(postId);
                    }).catch((error) => {
                        notyf.error('Erro ao adicionar comentário: ' + error.message);
                    });
                }
            });
        });

        // Report action
        const reportAction = postElement.querySelector('.report-action');
        reportAction.addEventListener('click', (e) => {
            e.preventDefault();
            Swal.fire({
                title: 'Denunciar Conteúdo',
                text: 'Tem certeza que deseja denunciar este conteúdo?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sim, denunciar!'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Here you would typically send the report to your backend
                    notyf.success('Conteúdo denunciado. Obrigado por nos ajudar a manter a comunidade segura.');
                }
            });
        });

        // Load comments
        loadComments(postId);

        return postElement;
    }

    // Load comments for a post
    function loadComments(postId) {
        const commentsSection = document.getElementById(`comments-${postId}`);
        commentsSection.innerHTML = '';

        database.ref('posts/' + postId + '/comments').on('child_added', (snapshot) => {
            const comment = snapshot.val();
            const commentElement = document.createElement('div');
            commentElement.className = 'comment';
            commentElement.innerHTML = `
                <img src="${comment.userAvatar || 'https://via.placeholder.com/30'}" alt="User Avatar" class="comment-avatar">
                <div class="comment-content">
                    <span class="comment-username">${comment.userName || 'Usuário'}</span>
                    <span class="comment-text">${comment.text}</span>
                </div>
            `;
            commentsSection.appendChild(commentElement);
        });
    }

    // Logout
    const logoutLink = document.getElementById('logoutLink');
    logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        auth.signOut().then(() => {
            window.location.href = 'index.html';
        }).catch((error) => {
            notyf.error('Erro ao fazer logout: ' + error.message);
        });
    });
});
